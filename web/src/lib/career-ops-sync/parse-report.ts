/**
 * Parser for career-ops evaluation reports at
 * `reports/NNN-{slug}-{YYYY-MM-DD}.md`. Pure function — takes the filename
 * plus its content, returns a `ParseResult<ParsedReport>`. No file I/O.
 *
 * @example
 *   parseReport("001-globaldata-2026-04-23.md", "# Evaluation: X — Y\n...")
 *   //   → { ok: true, value: { sequenceNumber: 1, company: "X", role: "Y", ... } }
 */

import type { ParsedReport, ParseResult } from "./types";

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const SEQ_FROM_FILENAME_RE = /^(\d{3})-/;
const FIRST_LINE_RE = /^# Evaluation: (.+)$/;
// Bolded key/value line, e.g. `**Date:** 2026-04-23`. Key may contain spaces.
const HEADER_LINE_RE = /^\*\*([^*:]+):\*\*\s*(.*)$/;
// Score value shape, e.g. `4.2/5` or `4/5`.
const SCORE_VALUE_RE = /^(\d+(?:\.\d+)?)\s*\/\s*5\s*$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
// Two-column markdown table data row. Non-greedy so trailing pipe matches cleanly.
const TABLE_ROW_RE = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/;
// TL;DR line anywhere in the doc.
const TLDR_RE = /^\*\*TL;DR:\*\*\s*(.+)$/;

/**
 * Split `"Company — Role"` on an em-dash or ASCII hyphen surrounded by
 * single spaces. Returns null if no delimiter is found. First occurrence
 * wins — company names may contain hyphens of their own (e.g. "Scale-AI"),
 * but the separator is literally space-dash-space between the two halves.
 */
function splitCompanyRole(s: string): { company: string; role: string } | null {
  const emIdx = s.indexOf(" — ");
  if (emIdx !== -1) {
    return {
      company: s.slice(0, emIdx).trim(),
      role: s.slice(emIdx + " — ".length).trim(),
    };
  }
  const hyIdx = s.indexOf(" - ");
  if (hyIdx !== -1) {
    return {
      company: s.slice(0, hyIdx).trim(),
      role: s.slice(hyIdx + " - ".length).trim(),
    };
  }
  return null;
}

function parseHeaderKvs(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const m = HEADER_LINE_RE.exec(line);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function parseRoleSummaryTable(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const roleSummaryIdx = content.indexOf("## A) Role Summary");
  if (roleSummaryIdx === -1) return out;

  const sectionStart = roleSummaryIdx;
  // Find the end of the section: next `## ` heading, or the next `---`
  // horizontal rule, whichever comes first.
  const nextHeadingIdx = content.indexOf("\n## ", sectionStart + 1);
  const nextHrIdx = content.indexOf("\n---", sectionStart + 1);
  const candidates = [nextHeadingIdx, nextHrIdx].filter((i) => i !== -1);
  const sectionEnd = candidates.length > 0 ? Math.min(...candidates) : content.length;

  const section = content.slice(sectionStart, sectionEnd);
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    // Skip header/separator rows (contain only "| Field | Value |" or dashes).
    if (trimmed === "" || /^\|[-\s|]+\|$/.test(trimmed)) continue;
    if (trimmed === "| Field | Value |" || trimmed.startsWith("| Field |")) continue;
    const m = TABLE_ROW_RE.exec(trimmed);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function findTldr(content: string): string | null {
  for (const line of content.split("\n")) {
    const m = TLDR_RE.exec(line.trim());
    if (m) return m[1].trim();
  }
  return null;
}

function err(file: string, reason: string): ParseResult<ParsedReport> {
  return { ok: false, error: { kind: "ParseError", file, reason } };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a career-ops evaluation report. Required fields are filename
 * sequence number, company, role, date, and score; missing any of them
 * returns an error. URL, legitimacy, TL;DR, and role-summary entries are
 * best-effort.
 */
export function parseReport(
  filename: string,
  content: string,
): ParseResult<ParsedReport> {
  if (typeof content !== "string") {
    throw new TypeError("parseReport: content must be a string");
  }

  const seqMatch = SEQ_FROM_FILENAME_RE.exec(filename);
  if (!seqMatch) {
    return err(
      filename,
      "filename must begin with a 3-digit sequence prefix (e.g. '001-…')",
    );
  }
  const sequenceNumber = Number.parseInt(seqMatch[1], 10);

  const lines = content.split("\n");
  const firstLine = lines[0] ?? "";
  const headerMatch = FIRST_LINE_RE.exec(firstLine);
  if (!headerMatch) {
    return err(
      filename,
      `first line must match "# Evaluation: {company} — {role}", got ${JSON.stringify(firstLine)}`,
    );
  }
  const split = splitCompanyRole(headerMatch[1]);
  if (!split) {
    return err(
      filename,
      `first line has no " — " or " - " separator between company and role: ${JSON.stringify(headerMatch[1])}`,
    );
  }

  const kvs = parseHeaderKvs(lines.slice(1, 20));

  const dateRaw = kvs["Date"];
  if (!dateRaw) return err(filename, "missing `**Date:**` header");
  if (!DATE_ISO_RE.test(dateRaw)) {
    return err(filename, `Date must be ISO YYYY-MM-DD, got ${JSON.stringify(dateRaw)}`);
  }

  const scoreRaw = kvs["Score"];
  if (!scoreRaw) return err(filename, "missing `**Score:**` header");
  const scoreMatch = SCORE_VALUE_RE.exec(scoreRaw);
  if (!scoreMatch) {
    return err(filename, `Score must match "N/5", got ${JSON.stringify(scoreRaw)}`);
  }
  const score = Number.parseFloat(scoreMatch[1]);
  if (!Number.isFinite(score) || score < 0 || score > 5) {
    return err(filename, `Score out of range 0–5: ${score}`);
  }

  const archetype = kvs["Archetype"] ?? "";
  const urlRaw = (kvs["URL"] ?? "").trim();
  const legitRaw = (kvs["Legitimacy"] ?? "").trim();

  return {
    ok: true,
    value: {
      sequenceNumber,
      date: dateRaw,
      company: split.company,
      role: split.role,
      archetype,
      score,
      jdUrl: urlRaw === "" ? null : urlRaw,
      legitimacy: legitRaw === "" ? null : legitRaw,
      rawMarkdown: content,
      tldr: findTldr(content),
      roleSummary: parseRoleSummaryTable(content),
    },
  };
}
