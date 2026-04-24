import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeCvVersion, makeFakePb } from "./fake-pb";
import type { FakePbHandle } from "./fake-pb";
import type { ParsedTailoredCv } from "./types";
import { upsertCvVersion } from "./upsert-cv-version";

const TEMPLATE_ID = "tpl_mayor_classic";

let fake: FakePbHandle;
let tmpRoot: string;

beforeEach(async () => {
  fake = makeFakePb();
  vi.spyOn(console, "log").mockImplementation(() => {});
  tmpRoot = await mkdtemp(join(tmpdir(), "upsert-cv-"));
});

afterEach(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

function makeCv(overrides: Partial<ParsedTailoredCv> = {}): ParsedTailoredCv {
  return {
    candidate: "Mayowa Adeogun",
    company: "GlobalData",
    date: "2026-04-24",
    archetype: "Head of IT",
    targetRole: "Head of IT",
    keywordCoveragePct: 92,
    jdUrl: null,
    markdownBody: "# Mayowa Adeogun\n\n## Professional Summary\nbody v1\n",
    summary: "body v1",
    ...overrides,
  };
}

describe("upsertCvVersion: create path", () => {
  it("creates a tailored cv_version with the deterministic label and fields", async () => {
    const result = await upsertCvVersion(fake.pb, makeCv(), null, TEMPLATE_ID);

    expect(result.action).toBe("created");
    expect(fake.state.cv_versions).toHaveLength(1);

    const v = fake.state.cv_versions[0];
    expect(v.label).toBe("Tailored — GlobalData Head of IT (2026-04-24)");
    expect(v.source).toBe("tailored");
    expect(v.markdown).toContain("# Mayowa Adeogun");
    expect(v.target_archetype).toBe("Head of IT");
    expect(v.template).toBe(TEMPLATE_ID);
  });

  it("wires `parent` to an existing source='base' cv_version when present", async () => {
    fake.state.cv_versions.push(
      fakeCvVersion({ id: "base_cv", source: "base", label: "Base CV — Mayor" }),
    );
    const result = await upsertCvVersion(fake.pb, makeCv(), null, TEMPLATE_ID);

    if (result.action !== "created") throw new Error("expected created");
    expect(fake.state.cv_versions).toHaveLength(2);
    const tailored = fake.state.cv_versions.find((v) => v.source === "tailored");
    expect(tailored?.parent).toBe("base_cv");
  });

  it("uploads a PDF when pdfPath is provided", async () => {
    const pdfPath = join(tmpRoot, "cv.pdf");
    await writeFile(pdfPath, Buffer.from("%PDF-1.4 fake pdf"));

    const result = await upsertCvVersion(fake.pb, makeCv(), pdfPath, TEMPLATE_ID);
    expect(result.action).toBe("created");

    // FakePb.create receives FormData when there's a file attached; the
    // fake extracts field name/value pairs and preserves the blob's name
    // as the `pdf` field value for easy inspection. Our stub doesn't store
    // the blob itself; it just records the FormData entries.
    const v = fake.state.cv_versions[0];
    // With FormData input, the fake spreads FormData.entries() into the
    // record. The `pdf` field ends up populated (non-empty string form or
    // File-ish placeholder). Assert it isn't empty.
    expect(normalisePdf(v.pdf)).not.toBe("");
  });
});

describe("upsertCvVersion: idempotency + diff", () => {
  it("SKIPs on identical re-run (same label, same body, no pdf drift)", async () => {
    await upsertCvVersion(fake.pb, makeCv(), null, TEMPLATE_ID);
    const r = await upsertCvVersion(fake.pb, makeCv(), null, TEMPLATE_ID);
    expect(r.action).toBe("skipped");
    expect(fake.state.cv_versions).toHaveLength(1);
  });

  it("UPDATEs on markdown diff and lists exactly that field", async () => {
    await upsertCvVersion(fake.pb, makeCv(), null, TEMPLATE_ID);

    const modified = makeCv({
      markdownBody: "# Mayowa Adeogun\n\n## Professional Summary\nbody v2 (revised)\n",
      summary: "body v2 (revised)",
    });
    const r = await upsertCvVersion(fake.pb, modified, null, TEMPLATE_ID);

    expect(r.action).toBe("updated");
    expect(r.fieldsChanged).toEqual(["markdown"]);
    expect(fake.state.cv_versions[0].markdown).toContain("v2 (revised)");
  });

  it("never overwrites an existing PDF (create first, re-run with pdf → SKIP)", async () => {
    // First pass: no pdf uploaded.
    const pdfPath = join(tmpRoot, "cv.pdf");
    await writeFile(pdfPath, Buffer.from("%PDF-1.4 initial"));
    await upsertCvVersion(fake.pb, makeCv(), pdfPath, TEMPLATE_ID);

    // Simulate PB returning a non-empty `pdf` filename after upload.
    fake.state.cv_versions[0] = {
      ...fake.state.cv_versions[0],
      pdf: "cv_stored.pdf",
    } as typeof fake.state.cv_versions[0];

    // Second pass with the same CV and a different PDF — skip, no overwrite.
    await writeFile(pdfPath, Buffer.from("%PDF-1.4 different bytes"));
    const r = await upsertCvVersion(fake.pb, makeCv(), pdfPath, TEMPLATE_ID);

    expect(r.action).toBe("skipped");
    expect(fake.state.cv_versions[0].pdf).toBe("cv_stored.pdf");
  });
});

describe("upsertCvVersion: different-day history", () => {
  it("treats different `date`s as distinct versions, not diffs", async () => {
    await upsertCvVersion(
      fake.pb,
      makeCv({ date: "2026-04-24" }),
      null,
      TEMPLATE_ID,
    );
    await upsertCvVersion(
      fake.pb,
      makeCv({ date: "2026-05-01" }),
      null,
      TEMPLATE_ID,
    );
    expect(fake.state.cv_versions).toHaveLength(2);
    const labels = fake.state.cv_versions.map((v) => v.label);
    expect(labels).toContain("Tailored — GlobalData Head of IT (2026-04-24)");
    expect(labels).toContain("Tailored — GlobalData Head of IT (2026-05-01)");
  });
});

// When the fake stores a FormData-shaped record, `pdf` can be a File/Blob
// or a string depending on how FormData iteration rendered it. Normalise
// for the presence check.
function normalisePdf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return "blob";
  return "";
}
