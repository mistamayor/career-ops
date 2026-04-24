import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFakePb } from "./fake-pb";
import type { FakePbHandle } from "./fake-pb";
import { syncAll } from "./sync-all";

const TEMPLATE_ID = "tpl_mayor_classic";

let fake: FakePbHandle;
let tmpRoot: string;

beforeEach(async () => {
  fake = makeFakePb();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  tmpRoot = await mkdtemp(join(tmpdir(), "sync-all-"));
  await mkdir(join(tmpRoot, "reports"), { recursive: true });
  await mkdir(join(tmpRoot, "output"), { recursive: true });

  // Copy the real GlobalData fixture into the temp career-ops structure.
  const reportFixture = await readFile(
    join(__dirname, "__fixtures__", "report-001-globaldata.md"),
    "utf8",
  );
  const cvFixture = await readFile(
    join(__dirname, "__fixtures__", "cv-mayowa-adeogun-globaldata.md"),
    "utf8",
  );
  await writeFile(
    join(tmpRoot, "reports", "001-globaldata-2026-04-23.md"),
    reportFixture,
  );
  await writeFile(
    join(tmpRoot, "output", "cv-mayowa-adeogun-globaldata-2026-04-24.md"),
    cvFixture,
  );
  // No PDF in this test — exercised in upsert-cv-version.test.ts.
});

afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

describe("syncAll: end-to-end with real fixtures", () => {
  it("first run creates the application and cv_version; summary reflects counts", async () => {
    const result = await syncAll(fake.pb, tmpRoot, TEMPLATE_ID);

    expect(result.totalReports).toBe(1);
    expect(result.applications.created).toBe(1);
    expect(result.applications.updated).toBe(0);
    expect(result.applications.skipped).toBe(0);
    expect(result.cvVersions.created).toBe(1);
    expect(result.errors).toEqual([]);

    expect(fake.state.applications).toHaveLength(1);
    expect(fake.state.applications[0].company).toBe("GlobalData Plc");
    expect(fake.state.cv_versions).toHaveLength(1);
    expect(fake.state.cv_versions[0].label).toContain("GlobalData Head of IT");
  });

  it("second run is fully idempotent (all SKIPs, no new events)", async () => {
    await syncAll(fake.pb, tmpRoot, TEMPLATE_ID);
    const beforeEvents = fake.state.events.length;

    const second = await syncAll(fake.pb, tmpRoot, TEMPLATE_ID);

    expect(second.applications.created).toBe(0);
    expect(second.applications.skipped).toBe(1);
    expect(second.cvVersions.skipped).toBe(1);
    expect(second.errors).toEqual([]);
    expect(fake.state.events.length).toBe(beforeEvents);
  });

  it("matches CV markdown to a report with an earlier date (2026-04-23 report ↔ 2026-04-24 CV)", async () => {
    const result = await syncAll(fake.pb, tmpRoot, TEMPLATE_ID);
    expect(result.cvVersions.created).toBe(1);
    const app = fake.state.applications[0];
    expect(app.cv_version).toBe(fake.state.cv_versions[0].id);
  });
});

describe("syncAll: report with no matching cv markdown", () => {
  it("syncs application only and records no error, just a warning", async () => {
    // Drop in a second report whose company has no cv in output/.
    await writeFile(
      join(tmpRoot, "reports", "002-orphan-co-2026-04-23.md"),
      [
        "# Evaluation: Orphan Co — Lead",
        "",
        "**Date:** 2026-04-23",
        "**Archetype:** Lead",
        "**Score:** 3.5/5",
        "**URL:** https://example.com/orphan",
        "**Legitimacy:** Medium",
        "",
      ].join("\n"),
    );

    const result = await syncAll(fake.pb, tmpRoot, TEMPLATE_ID);
    expect(result.totalReports).toBe(2);
    expect(result.applications.created).toBe(2);
    expect(result.cvVersions.created).toBe(1); // only globaldata got a cv
    expect(result.errors).toEqual([]);
  });
});
