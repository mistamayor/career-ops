import { describe, expect, it } from "vitest";

import {
  applicationKey,
  cvVersionKey,
  cvVersionLabel,
  findExistingApplication,
  findExistingCvVersion,
  slug,
} from "./natural-keys";
import type { ParsedReport, ParsedTailoredCv } from "./types";

describe("slug", () => {
  it("lowercases and kebab-cases spaces", () => {
    expect(slug("GlobalData Plc")).toBe("globaldata-plc");
    expect(slug("Head of IT")).toBe("head-of-it");
    expect(slug("Scale AI")).toBe("scale-ai");
  });

  it("strips punctuation and collapses runs", () => {
    expect(slug("Head of IT, Infrastructure & Cloud!")).toBe(
      "head-of-it-infrastructure-cloud",
    );
    expect(slug("a  b  c")).toBe("a-b-c");
  });

  it("strips unicode accents via NFD", () => {
    expect(slug("Café & Cie")).toBe("cafe-cie");
    expect(slug("Señor")).toBe("senor");
    expect(slug("Société Générale")).toBe("societe-generale");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slug(" GlobalData ")).toBe("globaldata");
    expect(slug("---a---")).toBe("a");
  });

  it("returns empty string on punctuation-only / empty inputs", () => {
    expect(slug("")).toBe("");
    expect(slug("   ")).toBe("");
    expect(slug("!!!")).toBe("");
  });

  it("preserves digits", () => {
    expect(slug("Company 42")).toBe("company-42");
    expect(slug("v1.2.3")).toBe("v1-2-3");
  });

  it("handles very long strings without error", () => {
    const long = "x".repeat(500);
    expect(slug(long)).toBe(long);
  });
});

describe("applicationKey", () => {
  it("joins company+role slugs with `::`", () => {
    expect(applicationKey({ company: "GlobalData Plc", role: "Head of IT" })).toBe(
      "globaldata-plc::head-of-it",
    );
  });

  it("is stable across casing differences", () => {
    const a = applicationKey({ company: "Anthropic", role: "MTS" });
    const b = applicationKey({ company: "ANTHROPIC", role: "mts" });
    expect(a).toBe(b);
  });
});

describe("cvVersionKey", () => {
  it("joins candidate::company::date (slugged)", () => {
    const cv = makeCv({
      candidate: "Mayowa Adeogun",
      company: "GlobalData",
      date: "2026-04-24",
    });
    expect(cvVersionKey(cv)).toBe("mayowa-adeogun::globaldata::2026-04-24");
  });

  it("date differences produce distinct keys", () => {
    const a = cvVersionKey(makeCv({ date: "2026-04-24" }));
    const b = cvVersionKey(makeCv({ date: "2026-04-25" }));
    expect(a).not.toBe(b);
  });
});

describe("cvVersionLabel", () => {
  it("formats the deterministic label", () => {
    const cv = makeCv({
      company: "GlobalData",
      targetRole: "Head of IT",
      date: "2026-04-24",
    });
    expect(cvVersionLabel(cv)).toBe("Tailored — GlobalData Head of IT (2026-04-24)");
  });

  it("is the same string for identical inputs (round-trippable for match)", () => {
    const cv = makeCv({ date: "2026-04-24" });
    expect(cvVersionLabel(cv)).toBe(cvVersionLabel(cv));
  });
});

describe("findExistingApplication", () => {
  const report = makeReport({ company: "GlobalData Plc", role: "Head of IT" });

  it("returns null when no record matches", () => {
    expect(findExistingApplication([], report)).toBeNull();
    expect(
      findExistingApplication(
        [{ company: "Anthropic", role: "MTS" }],
        report,
      ),
    ).toBeNull();
  });

  it("matches by slugged (company, role) regardless of casing/whitespace", () => {
    const existing = [
      { id: "a", company: "globaldata  plc", role: "HEAD OF IT" },
      { id: "b", company: "Anthropic", role: "MTS" },
    ];
    const hit = findExistingApplication(existing, report);
    expect(hit?.id).toBe("a");
  });
});

describe("findExistingCvVersion", () => {
  const cv = makeCv({
    company: "GlobalData",
    targetRole: "Head of IT",
    date: "2026-04-24",
  });

  it("matches by label equality", () => {
    const existing = [
      { id: "v1", label: "Base CV — Mayor" },
      { id: "v2", label: "Tailored — GlobalData Head of IT (2026-04-24)" },
    ];
    expect(findExistingCvVersion(existing, cv)?.id).toBe("v2");
  });

  it("returns null when the label hasn't been written yet", () => {
    expect(findExistingCvVersion([{ label: "Base CV — Mayor" }], cv)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCv(overrides: Partial<ParsedTailoredCv> = {}): ParsedTailoredCv {
  return {
    candidate: "Mayowa Adeogun",
    company: "GlobalData",
    date: "2026-04-24",
    archetype: "Head of IT",
    targetRole: "Head of IT",
    keywordCoveragePct: 92,
    jdUrl: null,
    markdownBody: "# Mayowa Adeogun\n\n## Professional Summary\nbody\n",
    summary: "body",
    ...overrides,
  };
}

function makeReport(overrides: Partial<ParsedReport> = {}): ParsedReport {
  return {
    sequenceNumber: 1,
    date: "2026-04-23",
    company: "GlobalData Plc",
    role: "Head of IT",
    archetype: "Head of IT",
    score: 4.2,
    jdUrl: null,
    legitimacy: null,
    rawMarkdown: "",
    tldr: null,
    roleSummary: {},
    ...overrides,
  };
}
