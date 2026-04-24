/**
 * Parser for career-ops output filenames. The pattern is
 *
 *     cv-{candidateSlug}-{companySlug}-{YYYY-MM-DD}.{pdf|md}
 *
 * where both slugs are kebab-case (lowercase letters, numbers, hyphens).
 *
 * Two resolution strategies, in order:
 *
 * 1. **Known-slug match (preferred)**: when `options.knownCompanySlugs` is
 *    provided, we try each slug longest-first and accept the first exact
 *    match. This is the only reliable way to handle multi-word companies
 *    (`scale-ai`, `open-ai`, etc.) — the sync layer loads this list from
 *    existing PocketBase applications before calling us.
 *
 * 2. **Backwards last-hyphen heuristic (fallback)**: the last 10 characters
 *    before the extension must be the date; the LAST hyphen of the middle
 *    chunk separates candidate (left) from company (right). Works for
 *    single-token companies, wrong for multi-word ones.
 *
 * @example
 *   parseOutputFilename("cv-mayowa-adeogun-globaldata-2026-04-24.pdf")
 *   // → { ok: true, value: { candidateSlug: "mayowa-adeogun", companySlug: "globaldata", ... } }
 *
 *   parseOutputFilename(
 *     "cv-mayowa-adeogun-scale-ai-2026-04-24.pdf",
 *     { knownCompanySlugs: ["scale-ai"] },
 *   );
 *   // → { ok: true, value: { candidateSlug: "mayowa-adeogun", companySlug: "scale-ai", ... } }
 */

import type { ParsedOutputFilename, ParseResult } from "./types";

const SLUG_CHAR_RE = /^[a-z0-9-]+$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ParseOutputFilenameOptions = {
  /**
   * Slugs of companies we already know about (typically fetched from PB
   * applications at sync time). Disambiguates multi-word company slugs.
   */
  knownCompanySlugs?: readonly string[];
};

function err(file: string, reason: string): ParseResult<ParsedOutputFilename> {
  return { ok: false, error: { kind: "ParseError", file, reason } };
}

/**
 * Parse an `output/cv-*-*-*.pdf` or `.md` filename. Returns a
 * `ParseResult` containing kind, candidate slug, company slug, and date.
 *
 * Pass `options.knownCompanySlugs` when available — it short-circuits the
 * fallback heuristic and reliably handles multi-word company slugs.
 * Without it, a `console.warn` fires when the candidate slug looks suspect
 * (no hyphens) — often the symptom of a missed multi-word-company case.
 */
export function parseOutputFilename(
  filename: string,
  options: ParseOutputFilenameOptions = {},
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

  // Strategy 1: try known company slugs (longest first) to disambiguate
  // multi-word kebab companies cleanly before falling back to the
  // last-hyphen heuristic.
  const knownSlugs = options.knownCompanySlugs;
  if (knownSlugs && knownSlugs.length > 0) {
    const sorted = [...knownSlugs].sort((a, b) => b.length - a.length);
    for (const companyCandidate of sorted) {
      const suffix = `-${companyCandidate}`;
      if (!nameChunk.endsWith(suffix)) continue;
      const candidateSlug = nameChunk.slice(0, -suffix.length);
      if (candidateSlug === "" || !SLUG_CHAR_RE.test(candidateSlug)) continue;
      if (!SLUG_CHAR_RE.test(companyCandidate)) continue;
      return {
        ok: true,
        value: {
          filename,
          kind,
          candidateSlug,
          companySlug: companyCandidate,
          date,
        },
      };
    }
  }

  // Strategy 2: split the middle chunk on the LAST hyphen: candidate-slug | company-slug.
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
