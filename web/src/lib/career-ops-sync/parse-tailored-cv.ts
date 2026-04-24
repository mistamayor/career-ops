/**
 * Parser for tailored CV markdown files at
 * `output/cv-{candidate}-{company}-{YYYY-MM-DD}.md`. Pure function.
 *
 * The frontmatter shape is defined by `modes/pdf.md` step 11b (commit
 * c2efa0f) — candidate, company, date, archetype, target_role,
 * keyword_coverage_pct, jd_url. The body is consumed verbatim as the
 * source of truth for `cv_versions.markdown`; the Professional Summary
 * section is additionally extracted for previews.
 *
 * @example
 *   parseTailoredCv(
 *     "cv-mayowa-adeogun-globaldata-2026-04-24.md",
 *     "---\ncandidate: Mayowa Adeogun\n...\n---\n# Mayowa Adeogun\n...",
 *   );
 *   //   → { ok: true, value: { candidate: "Mayowa Adeogun", ..., summary: "..." } }
 */

import matter from "gray-matter";

import type { ParsedTailoredCv, ParseResult } from "./types";

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerce a frontmatter value to a string, handling the `js-yaml` quirk
 * where bare dates like `2026-04-24` come back as JS `Date` objects.
 * Returns null if the value is missing or of an unsupported type.
 */
function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return String(value);
  return null;
}

function asIntegerPercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractSummary(body: string): string | null {
  const idx = body.indexOf("## Professional Summary");
  if (idx === -1) return null;
  // Skip past the heading line itself.
  const afterHeading = body.slice(idx + "## Professional Summary".length);
  const lineBreakIdx = afterHeading.indexOf("\n");
  if (lineBreakIdx === -1) return null;
  const rest = afterHeading.slice(lineBreakIdx + 1);
  // Next section starts at the first line-begun `## ` heading.
  const nextHeadingIdx = rest.search(/(^|\n)## /);
  const sectionText =
    nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
  const trimmed = sectionText.trim();
  return trimmed === "" ? null : trimmed;
}

function err(file: string, reason: string): ParseResult<ParsedTailoredCv> {
  return { ok: false, error: { kind: "ParseError", file, reason } };
}

/**
 * Parse a tailored CV markdown file emitted by career-ops' `pdf` mode.
 * Required frontmatter keys: candidate, company, date, archetype,
 * target_role, keyword_coverage_pct. `jd_url` is optional (empty/missing
 * → null). Body must contain a `## Professional Summary` section.
 */
export function parseTailoredCv(
  filename: string,
  content: string,
): ParseResult<ParsedTailoredCv> {
  if (typeof content !== "string") {
    throw new TypeError("parseTailoredCv: content must be a string");
  }

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(content);
  } catch (e) {
    return err(
      filename,
      `frontmatter parse failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // gray-matter returns an empty data object when there is no frontmatter.
  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    return err(filename, "missing or empty YAML frontmatter");
  }
  const fm = parsed.data as Record<string, unknown>;

  const candidate = asString(fm["candidate"]);
  if (!candidate) return err(filename, "frontmatter `candidate` missing or not a string");

  const company = asString(fm["company"]);
  if (!company) return err(filename, "frontmatter `company` missing or not a string");

  const dateStr = asString(fm["date"]);
  if (!dateStr) return err(filename, "frontmatter `date` missing");
  if (!DATE_ISO_RE.test(dateStr)) {
    return err(
      filename,
      `frontmatter \`date\` must be ISO YYYY-MM-DD, got ${JSON.stringify(dateStr)}`,
    );
  }

  const archetype = asString(fm["archetype"]);
  if (!archetype) return err(filename, "frontmatter `archetype` missing");

  const targetRole = asString(fm["target_role"]);
  if (!targetRole) return err(filename, "frontmatter `target_role` missing");

  const kwPct = asIntegerPercent(fm["keyword_coverage_pct"]);
  if (kwPct === null) {
    return err(filename, "frontmatter `keyword_coverage_pct` missing or not numeric");
  }
  if (kwPct < 0 || kwPct > 100) {
    return err(
      filename,
      `frontmatter \`keyword_coverage_pct\` must be 0–100, got ${kwPct}`,
    );
  }

  const jdUrlRaw = asString(fm["jd_url"]);
  const jdUrl = jdUrlRaw === null || jdUrlRaw.trim() === "" ? null : jdUrlRaw.trim();

  const markdownBody = parsed.content.replace(/^\s+/, "");
  const summary = extractSummary(markdownBody);
  if (!summary) {
    return err(filename, "body is missing a `## Professional Summary` section");
  }

  return {
    ok: true,
    value: {
      candidate,
      company,
      date: dateStr,
      archetype,
      targetRole,
      keywordCoveragePct: kwPct,
      jdUrl,
      markdownBody,
      summary,
    },
  };
}
