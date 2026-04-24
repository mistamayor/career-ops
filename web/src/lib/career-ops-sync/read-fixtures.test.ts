import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findCareerOpsArtefacts } from "./read-fixtures";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "career-ops-sync-"));
  await mkdir(join(root, "reports"), { recursive: true });
  await mkdir(join(root, "output"), { recursive: true });

  // Reports — deliberate out-of-order creation to prove we sort by sequence.
  await writeFile(
    join(root, "reports", "003-retool-2026-04-22.md"),
    "# Evaluation: Retool — Lead\n",
  );
  await writeFile(
    join(root, "reports", "001-globaldata-2026-04-23.md"),
    "# Evaluation: GlobalData — Head of IT\n",
  );
  await writeFile(
    join(root, "reports", "002-anthropic-2026-04-23.md"),
    "# Evaluation: Anthropic — MTS\n",
  );
  // Non-matching file should be ignored.
  await writeFile(join(root, "reports", "README.md"), "not a report\n");

  // Outputs — markdown + pdf across two dates.
  await writeFile(join(root, "output", "cv-mayowa-adeogun-globaldata-2026-04-23.md"), "# …\n");
  await writeFile(join(root, "output", "cv-mayowa-adeogun-globaldata-2026-04-23.pdf"), "%PDF-dummy");
  await writeFile(join(root, "output", "cv-mayowa-adeogun-globaldata-2026-04-24.md"), "# …\n");
  await writeFile(join(root, "output", "cv-mayowa-adeogun-globaldata-2026-04-24.pdf"), "%PDF-dummy");
  await writeFile(join(root, "output", "cv-mayowa-adeogun-anthropic-2026-04-23.pdf"), "%PDF-dummy");
  // Non-matching file should be ignored.
  await writeFile(join(root, "output", "notes.txt"), "ignore me");
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("findCareerOpsArtefacts", () => {
  it("discovers reports and sorts by sequence number", async () => {
    const set = await findCareerOpsArtefacts(root);
    expect(set.reports.map((r) => r.filename)).toEqual([
      "001-globaldata-2026-04-23.md",
      "002-anthropic-2026-04-23.md",
      "003-retool-2026-04-22.md",
    ]);
    // Content is read into memory.
    expect(set.reports[0].content).toContain("GlobalData");
    expect(set.reports[0].path.endsWith("001-globaldata-2026-04-23.md")).toBe(true);
  });

  it("discovers cv markdowns, sorts date DESC then filename ASC", async () => {
    const set = await findCareerOpsArtefacts(root);
    // 04-24 before 04-23 because DESC by date.
    expect(set.cvMarkdowns.map((f) => f.filename)).toEqual([
      "cv-mayowa-adeogun-globaldata-2026-04-24.md",
      "cv-mayowa-adeogun-globaldata-2026-04-23.md",
    ]);
    expect(set.cvMarkdowns[0].sizeBytes).toBeGreaterThan(0);
    expect(set.cvMarkdowns[0].mtime).toBeInstanceOf(Date);
  });

  it("discovers PDFs (metadata only, not content)", async () => {
    const set = await findCareerOpsArtefacts(root);
    expect(set.pdfs.map((f) => f.filename)).toEqual([
      "cv-mayowa-adeogun-globaldata-2026-04-24.pdf",
      "cv-mayowa-adeogun-anthropic-2026-04-23.pdf",
      "cv-mayowa-adeogun-globaldata-2026-04-23.pdf",
    ]);
  });

  it("ignores non-matching files", async () => {
    const set = await findCareerOpsArtefacts(root);
    expect(set.reports.some((r) => r.filename === "README.md")).toBe(false);
    expect(set.pdfs.some((p) => p.filename.endsWith(".txt"))).toBe(false);
  });

  it("returns empty arrays for a non-existent career-ops dir", async () => {
    const set = await findCareerOpsArtefacts("/tmp/__does-not-exist-__/career-ops");
    expect(set.reports).toEqual([]);
    expect(set.cvMarkdowns).toEqual([]);
    expect(set.pdfs).toEqual([]);
  });
});
