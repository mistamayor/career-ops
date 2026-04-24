import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeCvVersion, makeFakePb } from "./fake-pb";
import type { FakePbHandle } from "./fake-pb";
import type { SyncAllResult } from "./sync-all";
import { watchCareerOps, type AbortableWatcher } from "./watch";

const TEMPLATE_ID = "tpl_mayor_classic";
const DEBOUNCE_MS = 150; // small to keep tests fast
// chokidar's awaitWriteFinish needs 500ms of stability before emitting, then
// our debounce runs, then syncAll itself takes a few ms with the fake PB.
// 1500ms leaves ample slack so tests aren't flaky.
const BUFFER_MS = 1500;

let fake: FakePbHandle;
let tmpRoot: string;
let watcher: AbortableWatcher | null;

beforeEach(async () => {
  fake = makeFakePb({
    cv_versions: [fakeCvVersion({ id: "base_cv", source: "base" })],
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  tmpRoot = await mkdtemp(join(tmpdir(), "watch-"));
  await mkdir(join(tmpRoot, "reports"), { recursive: true });
  await mkdir(join(tmpRoot, "output"), { recursive: true });
  watcher = null;
});

afterEach(async () => {
  if (watcher) await watcher.close();
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function startWatcher(
  onSync: (r: SyncAllResult) => void,
  debounceMs = DEBOUNCE_MS,
): Promise<void> {
  return new Promise((resolveReady) => {
    let readyFired = false;
    watcher = watchCareerOps(fake.pb, tmpRoot, {
      debounceMs,
      defaultTemplateId: TEMPLATE_ID,
      onSync: (r) => {
        if (!readyFired) {
          readyFired = true;
          // First onSync means the first syncAll completed — the watcher has
          // been fully wired. Caller can now make its assertions.
          resolveReady();
        }
        onSync(r);
      },
    });
    // If no sync fires within a grace window, resolve anyway — the test
    // drives its own file writes and checks results explicitly.
    setTimeout(() => {
      if (!readyFired) {
        readyFired = true;
        resolveReady();
      }
    }, 300);
  });
}

async function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const REPORT_BODY = [
  "# Evaluation: Anthropic — MTS",
  "",
  "**Date:** 2026-04-24",
  "**Archetype:** Applied AI",
  "**Score:** 4.5/5",
  "**URL:** https://example.com/anthropic",
  "**Legitimacy:** High Confidence",
  "",
  "## A) Role Summary",
  "",
  "| Field | Value |",
  "|-------|-------|",
  "| Company | Anthropic |",
  "| Role | MTS |",
  "",
  "**TL;DR:** Placeholder.",
].join("\n");

const CV_BODY = [
  "---",
  "candidate: Mayowa Adeogun",
  "company: Anthropic",
  'date: "2026-04-24"',
  "archetype: Applied AI",
  "target_role: MTS",
  "keyword_coverage_pct: 90",
  "---",
  "",
  "# Mayowa Adeogun",
  "",
  "## Professional Summary",
  "Body.",
].join("\n");

describe("watchCareerOps", () => {
  it("debounces a burst of writes into a single syncAll call", async () => {
    const calls: SyncAllResult[] = [];
    await startWatcher((r) => calls.push(r));

    // Emulate career-ops emitting three files in rapid succession.
    await writeFile(
      join(tmpRoot, "reports", "001-anthropic-2026-04-24.md"),
      REPORT_BODY,
    );
    await writeFile(
      join(tmpRoot, "output", "cv-mayowa-adeogun-anthropic-2026-04-24.md"),
      CV_BODY,
    );
    await writeFile(
      join(tmpRoot, "output", "cv-mayowa-adeogun-anthropic-2026-04-24.pdf"),
      Buffer.from("%PDF-1.4 fake"),
    );

    await wait(DEBOUNCE_MS + BUFFER_MS);

    expect(calls).toHaveLength(1);
    expect(calls[0].applications.created).toBe(1);
    expect(calls[0].cvVersions.created).toBe(1);
    expect(fake.state.applications).toHaveLength(1);
  });

  it("recovers from a malformed report and syncs on the next valid write", async () => {
    const calls: SyncAllResult[] = [];
    await startWatcher((r) => calls.push(r));

    await writeFile(
      join(tmpRoot, "reports", "001-bad-2026-04-24.md"),
      "not a valid evaluation report\n",
    );
    await wait(DEBOUNCE_MS + BUFFER_MS);

    // First burst: one syncAll ran; the bad report counted as a parse error
    // but did not crash the watcher.
    expect(calls).toHaveLength(1);
    expect(calls[0].errors.length).toBeGreaterThan(0);
    expect(fake.state.applications).toHaveLength(0);

    // Second burst: a well-formed report. The watcher is still alive.
    await writeFile(
      join(tmpRoot, "reports", "002-anthropic-2026-04-24.md"),
      REPORT_BODY,
    );
    await wait(DEBOUNCE_MS + BUFFER_MS);

    expect(calls).toHaveLength(2);
    expect(calls[1].applications.created).toBe(1);
    expect(fake.state.applications).toHaveLength(1);
  });

  it("persists sync_state on each run (upserts the singleton row)", async () => {
    const calls: SyncAllResult[] = [];
    await startWatcher((r) => calls.push(r));

    await writeFile(
      join(tmpRoot, "reports", "001-anthropic-2026-04-24.md"),
      REPORT_BODY,
    );
    await wait(DEBOUNCE_MS + BUFFER_MS);

    expect(fake.state.sync_state).toHaveLength(1);
    expect(fake.state.sync_state[0].last_sync_trigger).toBe("watch");

    // Second burst — same row is updated, not a new one.
    await writeFile(
      join(tmpRoot, "output", "cv-mayowa-adeogun-anthropic-2026-04-24.md"),
      CV_BODY,
    );
    await wait(DEBOUNCE_MS + BUFFER_MS);
    expect(fake.state.sync_state).toHaveLength(1);
  });

  it("close() stops the watcher; later file writes do not trigger syncs", async () => {
    const calls: SyncAllResult[] = [];
    await startWatcher((r) => calls.push(r));
    await watcher!.close();
    watcher = null;

    await writeFile(
      join(tmpRoot, "reports", "001-anthropic-2026-04-24.md"),
      REPORT_BODY,
    );
    await wait(DEBOUNCE_MS + BUFFER_MS);

    // Because the watcher was closed before the write, no sync ran.
    expect(calls).toHaveLength(0);
    // Read-after to silence unused var lint.
    void (await readFile(
      join(tmpRoot, "reports", "001-anthropic-2026-04-24.md"),
      "utf8",
    ));
  });
});
