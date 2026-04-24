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

  it("uses knownCompanySlugs to disambiguate multi-word companies (correct split)", () => {
    // The sync layer passes knownCompanySlugs loaded from PocketBase
    // applications. With it, the parser picks the longest-matching known
    // company slug from the right-hand side and cleanly separates
    // candidate from company.
    const r = parseOutputFilename(
      "cv-mayowa-adeogun-scale-ai-2026-04-24.pdf",
      { knownCompanySlugs: ["scale-ai", "globaldata"] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.candidateSlug).toBe("mayowa-adeogun");
    expect(r.value.companySlug).toBe("scale-ai");
  });

  it("falls back to the backwards heuristic when no known slugs match", () => {
    // Without knownCompanySlugs, or when the filename's company isn't in
    // the known list, the last-hyphen heuristic is retained. This keeps
    // behaviour predictable on the first sync of a brand-new company.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = parseOutputFilename("cv-mayowa-adeogun-scale-ai-2026-04-24.pdf");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.candidateSlug).toBe("mayowa-adeogun-scale");
      expect(r.value.companySlug).toBe("ai");
    } finally {
      warn.mockRestore();
    }
  });

  it("longest known slug wins when multiple are prefixes of each other", () => {
    // Defensive ordering check: if "ai" and "scale-ai" are both in the
    // allowlist, the longer match must win (otherwise we'd pick "ai" and
    // leak the "scale" token back into the candidate).
    const r = parseOutputFilename(
      "cv-mayowa-adeogun-scale-ai-2026-04-24.pdf",
      { knownCompanySlugs: ["ai", "scale-ai"] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.companySlug).toBe("scale-ai");
    expect(r.value.candidateSlug).toBe("mayowa-adeogun");
  });

  it("falls through to the heuristic when knownCompanySlugs doesn't include the company", () => {
    const r = parseOutputFilename(
      "cv-mayowa-adeogun-globaldata-2026-04-24.pdf",
      { knownCompanySlugs: ["scale-ai", "anthropic"] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.companySlug).toBe("globaldata");
    expect(r.value.candidateSlug).toBe("mayowa-adeogun");
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
