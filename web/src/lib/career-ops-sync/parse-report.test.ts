import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseReport } from "./parse-report";

const FIXTURE_PATH = join(
  __dirname,
  "__fixtures__",
  "report-001-globaldata.md",
);
const GLOBALDATA = readFileSync(FIXTURE_PATH, "utf8");
const GLOBALDATA_FILENAME = "001-globaldata-2026-04-23.md";

describe("parseReport: real GlobalData fixture", () => {
  const result = parseReport(GLOBALDATA_FILENAME, GLOBALDATA);

  it("returns ok", () => {
    expect(result.ok).toBe(true);
  });

  it("parses sequence number from filename prefix", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.sequenceNumber).toBe(1);
  });

  it("parses date, company, role, score, legitimacy from header", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.date).toBe("2026-04-23");
    expect(result.value.company).toBe("GlobalData Plc");
    expect(result.value.role).toBe("Head of IT");
    expect(result.value.score).toBe(4.2);
    expect(result.value.legitimacy).toBe("High Confidence");
  });

  it("parses JD URL when present", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.jdUrl).toBe("https://careers.globaldata.com/job/868284");
  });

  it("captures raw markdown content unchanged", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.rawMarkdown).toBe(GLOBALDATA);
  });

  it("extracts a TL;DR beginning with the expected phrase", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.tldr).not.toBeNull();
    expect(result.value.tldr?.startsWith("Literal Head-of-IT mandate")).toBe(true);
  });

  it("parses role summary with expected keys", () => {
    if (!result.ok) throw new Error("expected ok");
    for (const key of ["Company", "Role", "Archetype", "Remote", "Location"]) {
      expect(
        result.value.roleSummary,
        `roleSummary missing key "${key}"`,
      ).toHaveProperty(key);
      expect(result.value.roleSummary[key].length).toBeGreaterThan(0);
    }
  });

  it("preserves cell content including parentheses and special chars", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.roleSummary["Role"]).toBe("Head of IT");
    expect(result.value.roleSummary["Location"]).toBe("London, EC4Y 0AN (UK)");
  });
});

describe("parseReport: error paths", () => {
  it("errors when filename lacks the NNN- prefix", () => {
    const r = parseReport("globaldata.md", "# Evaluation: X — Y\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/sequence prefix/i);
  });

  it("errors when first line is not an `# Evaluation:` header", () => {
    const r = parseReport("001-x-2026-04-23.md", "not a header\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/first line/i);
  });

  it("errors when the header has no company/role separator", () => {
    const r = parseReport(
      "001-x-2026-04-23.md",
      "# Evaluation: JustOneToken\n**Date:** 2026-04-23\n**Score:** 4/5\n",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/separator/i);
  });

  it("errors when the Date field is missing", () => {
    const r = parseReport(
      "001-x-2026-04-23.md",
      "# Evaluation: X — Y\n**Score:** 4/5\n",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/Date/);
  });

  it("errors when the Date field is malformed", () => {
    const r = parseReport(
      "001-x-2026-04-23.md",
      "# Evaluation: X — Y\n**Date:** April 23 2026\n**Score:** 4/5\n",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/YYYY-MM-DD/);
  });

  it("errors when the Score field is missing", () => {
    const r = parseReport(
      "001-x-2026-04-23.md",
      "# Evaluation: X — Y\n**Date:** 2026-04-23\n",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.reason).toMatch(/Score/);
  });

  it("errors on empty input", () => {
    const r = parseReport("001-x-2026-04-23.md", "");
    expect(r.ok).toBe(false);
  });
});
