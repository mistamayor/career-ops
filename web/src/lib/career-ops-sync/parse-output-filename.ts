/**
 * Parser for career-ops output filenames. The pattern is
 *
 *     cv-{candidateSlug}-{companySlug}-{YYYY-MM-DD}.{pdf|md}
 *
 * where both slugs are kebab-case (lowercase letters, numbers, hyphens).
 * Because both slugs may contain hyphens, the split is disambiguated
 * BACKWARDS: the last 10 characters before the extension must be the
 * date, and the LAST hyphen of the remaining middle chunk separates
 * candidate (left) from company (right).
 *
 * This heuristic handles the common case (single-word companies like
 * "globaldata", "anthropic", multi-word candidates like "mayowa-adeogun")
 * but fails for multi-word companies ("scale-ai"): the company slug
 * becomes just "ai" and the extra word gets absorbed into the candidate.
 * That's documented in the tests and left unresolved for Phase 1 — can
 * be revisited with a candidate allowlist if real data hits it.
 *
 * @example
 *   parseOutputFilename("cv-mayowa-adeogun-globaldata-2026-04-24.pdf")
 *   //   → { ok: true, value: { candidateSlug: "mayowa-adeogun", companySlug: "globaldata", date: "2026-04-24", kind: "pdf" } }
 */

import type { ParsedOutputFilename, ParseResult } from "./types";

const SLUG_CHAR_RE = /^[a-z0-9-]+$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(file: string, reason: string): ParseResult<ParsedOutputFilename> {
  return { ok: false, error: { kind: "ParseError", file, reason } };
}

/**
 * Parse an `output/cv-*-*-*.pdf` or `.md` filename. Returns a
 * `ParseResult` containing kind, candidate slug, company slug, and date.
 * Logs a `console.warn` if the resulting candidate slug has no hyphens —
 * that's unusual (most names are "first-last") and may signal a wrong
 * split on a multi-word-company input.
 */
export function parseOutputFilename(
  filename: string,
): ParseResult<ParsedOutputFilename> {
  // Extension + kind.
  let kind: "pdf" | "markdown";
  let stem: string;
  if (filename.endsWith(".pdf")) {
    kind = "pdf";
    stem = filename.slice(0, -".pdf".length);
  } else if (filename.endsWith(".md")) {
    kind = "markdown";
    stem = filename.slice(0, -".md".length);
  } else {
    return err(filename, "expected .pdf or .md extension");
  }

  // Prefix.
  if (!stem.startsWith("cv-")) {
    return err(filename, "expected 'cv-' prefix");
  }
  const afterPrefix = stem.slice("cv-".length);

  // Date suffix — the last 10 chars must be YYYY-MM-DD, preceded by '-'.
  if (afterPrefix.length < 11) {
    return err(filename, "too short to contain both a name chunk and a date");
  }
  const date = afterPrefix.slice(-10);
  if (!DATE_ISO_RE.test(date)) {
    return err(filename, `trailing date must be ISO YYYY-MM-DD, got ${JSON.stringify(date)}`);
  }
  const beforeDate = afterPrefix.slice(0, -10);
  if (!beforeDate.endsWith("-")) {
    return err(filename, "expected '-' separator between name chunk and date");
  }
  const nameChunk = beforeDate.slice(0, -1);
  if (nameChunk.length === 0) {
    return err(filename, "empty candidate/company chunk");
  }

  // Split the middle chunk on the LAST hyphen: candidate-slug | company-slug.
  const lastHyphenIdx = nameChunk.lastIndexOf("-");
  if (lastHyphenIdx === -1) {
    return err(
      filename,
      "expected at least one hyphen between candidate slug and company slug",
    );
  }
  const candidateSlug = nameChunk.slice(0, lastHyphenIdx);
  const companySlug = nameChunk.slice(lastHyphenIdx + 1);

  if (candidateSlug === "" || companySlug === "") {
    return err(filename, "candidate or company slug is empty after split");
  }
  if (!SLUG_CHAR_RE.test(candidateSlug) || !SLUG_CHAR_RE.test(companySlug)) {
    return err(
      filename,
      "slugs must be kebab-case (lowercase letters, digits, hyphens)",
    );
  }

  // Heuristic warning: candidate slugs almost always contain a hyphen
  // (first-last). A single-token candidate is the symptom of either a
  // single-name candidate or a misclassified multi-word company — noisy
  // but not fatal, so log and proceed.
  if (!candidateSlug.includes("-")) {
    console.warn(
      `[parseOutputFilename] candidate slug "${candidateSlug}" has no hyphen — ` +
        `if the company is a multi-word kebab (e.g. "scale-ai"), the backwards ` +
        `split may have absorbed a company token into the candidate. Source: ${filename}`,
    );
  }

  return {
    ok: true,
    value: {
      filename,
      kind,
      candidateSlug,
      companySlug,
      date,
    },
  };
}
