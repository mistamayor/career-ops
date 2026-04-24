import { describe, expect, it, vi } from "vitest";

import { parseOutputFilename } from "./parse-output-filename";

describe("parseOutputFilename: happy paths", () => {
  it("parses a multi-part candidate + single-word company (PDF)", () => {
    const r = parseOutputFilename("cv-mayowa-adeogun-globaldata-2026-04-24.pdf");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      filename: "cv-mayowa-adeogun-globaldata-2026-04-24.pdf",
      kind: "pdf",
      candidateSlug: "mayowa-adeogun",
      companySlug: "globaldata",
      date: "2026-04-24",
    });
  });

  it("parses the markdown variant", () => {
    const r = parseOutputFilename("cv-mayowa-adeogun-globaldata-2026-04-24.md");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("markdown");
    expect(r.value.candidateSlug).toBe("mayowa-adeogun");
    expect(r.value.companySlug).toBe("globaldata");
  });

  it("accepts single-token candidate slugs (warns once)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = parseOutputFilename("cv-santiago-anthropic-2026-05-01.pdf");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.candidateSlug).toBe("santiago");
      expect(r.value.companySlug).toBe("anthropic");
      expect(r.value.date).toBe("2026-05-01");
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("documents the multi-word-company limitation of the backwards split", () => {
    // Known limitation: the backwards-split heuristic ALWAYS takes the
    // rightmost hyphen as the candidate/company boundary. For a multi-word
    // company like "scale-ai", the "scale" token gets absorbed into the
    // candidate slug and the company becomes just "ai".
    //
    // Documenting this behaviour in a test so that if/when we revisit this
    // (e.g. with a companies allowlist or explicit separator), we'll flip
    // this test from asserting the wrong split to asserting the correct one.
    const r = parseOutputFilename("cv-mayowa-adeogun-scale-ai-2026-04-24.pdf");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.candidateSlug).toBe("mayowa-adeogun-scale");
    expect(r.value.companySlug).toBe("ai");
  });
});

describe("parseOutputFilename: error paths", () => {
  it("errors when the extension is not .pdf or .md", () => {
    const r = parseOutputFilename("cv-mayowa-adeogun-globaldata-2026-04-24.docx");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/\.pdf or \.md/);
  });

  it("errors when the 'cv-' prefix is missing", () => {
    const r = parseOutputFilename("resume-mayowa-adeogun-globaldata-2026-04-24.pdf");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/cv-/);
  });

  it("errors when the date segment is missing or malformed", () => {
    const r = parseOutputFilename("cv-mayowa-adeogun-globaldata.pdf");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/date|YYYY-MM-DD/i);
  });

  it("errors when the name chunk has no hyphen (single-token after 'cv-')", () => {
    const r = parseOutputFilename("cv-soloname-2026-04-24.pdf");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/hyphen/);
  });

  it("errors on an empty name chunk", () => {
    const r = parseOutputFilename("cv--2026-04-24.pdf");
    expect(r.ok).toBe(false);
  });
});
