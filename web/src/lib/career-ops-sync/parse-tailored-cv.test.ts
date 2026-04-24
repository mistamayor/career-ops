import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTailoredCv } from "./parse-tailored-cv";

const FIXTURE_PATH = join(
  __dirname,
  "__fixtures__",
  "cv-mayowa-adeogun-globaldata.md",
);
const FIXTURE = readFileSync(FIXTURE_PATH, "utf8");
const FIXTURE_FILENAME = "cv-mayowa-adeogun-globaldata-2026-04-24.md";

describe("parseTailoredCv: real GlobalData fixture", () => {
  const result = parseTailoredCv(FIXTURE_FILENAME, FIXTURE);

  it("returns ok", () => {
    expect(result.ok).toBe(true);
  });

  it("parses frontmatter fields", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.candidate).toBe("Mayowa Adeogun");
    expect(result.value.company).toBe("GlobalData");
    expect(result.value.date).toBe("2026-04-24");
    expect(result.value.archetype).toBe("Head of IT / IT Leadership");
    expect(result.value.targetRole).toBe("Head of IT");
    expect(result.value.keywordCoveragePct).toBe(92);
    expect(result.value.jdUrl).toBe("https://careers.globaldata.com/job/868284");
  });

  it("returns the markdown body starting at the `# Name` heading", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.markdownBody.startsWith("# Mayowa Adeogun")).toBe(true);
  });

  it("extracts the Professional Summary paragraph", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.summary).toContain("Strategic, hands-on Head of IT");
    // Summary should stop before the next section heading.
    expect(result.value.summary).not.toContain("## Core Competencies");
  });
});

describe("parseTailoredCv: error paths", () => {
  it("errors when frontmatter is absent", () => {
    const r = parseTailoredCv(
      "cv-x-y-2026-04-24.md",
      "# No Frontmatter\n\n## Professional Summary\nText\n",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/frontmatter/i);
  });

  it("errors when `date` is malformed", () => {
    const r = parseTailoredCv(
      "cv-x-y-2026-04-24.md",
      [
        "---",
        "candidate: X",
        "company: Y",
        'date: "not-a-date"',
        "archetype: A",
        "target_role: R",
        "keyword_coverage_pct: 50",
        "---",
        "# X",
        "",
        "## Professional Summary",
        "Text",
      ].join("\n"),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/YYYY-MM-DD/);
  });

  it("errors when `keyword_coverage_pct` is out of range", () => {
    const r = parseTailoredCv(
      "cv-x-y-2026-04-24.md",
      [
        "---",
        "candidate: X",
        "company: Y",
        "date: 2026-04-24",
        "archetype: A",
        "target_role: R",
        "keyword_coverage_pct: 150",
        "---",
        "# X",
        "",
        "## Professional Summary",
        "Text",
      ].join("\n"),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/0.?100/);
  });

  it("errors when the Professional Summary section is absent", () => {
    const r = parseTailoredCv(
      "cv-x-y-2026-04-24.md",
      [
        "---",
        "candidate: X",
        "company: Y",
        "date: 2026-04-24",
        "archetype: A",
        "target_role: R",
        "keyword_coverage_pct: 50",
        "---",
        "# X",
        "",
        "## Core Competencies",
        "- one",
      ].join("\n"),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/Professional Summary/);
  });
});
