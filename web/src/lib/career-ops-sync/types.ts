/**
 * Shared types for the Phase 1 parsers. All three parsers (evaluation
 * report, tailored CV markdown, output filename) share the same
 * `ParseResult<T>` envelope — a pure function returns either success with
 * a typed value, or a structured error that names the file and the reason.
 *
 * No parser in this module touches the filesystem, the network, or the
 * database. That side of Phase 1 lives in the upsert layer (Prompt 2) and
 * the watcher (Prompt 3).
 */

/**
 * Output of parsing a `reports/NNN-{slug}-{YYYY-MM-DD}.md` evaluation
 * report. Mirrors the fields that the web app's `applications` collection
 * cares about plus the raw markdown so we can store the report verbatim.
 */
export type ParsedReport = {
  /** 001, 002, etc. from filename prefix. */
  sequenceNumber: number;
  /** Parsed from the report's `**Date:**` field, ISO YYYY-MM-DD. */
  date: string;
  company: string;
  role: string;
  /**
   * Freeform archetype string, e.g.
   * `"Head of IT / IT Leadership (primary) × Digital & Technology
   *   Transformation Leader (secondary)"`.
   */
  archetype: string;
  /** 0.0–5.0 — parsed from `**Score:** 4.2/5`. */
  score: number;
  jdUrl: string | null;
  /** `"High Confidence"`, `"Medium"`, `"Low"`, or null if missing/empty. */
  legitimacy: string | null;
  /** Full report content as-is, for storing in `applications.evaluation_report_md`. */
  rawMarkdown: string;
  /** TL;DR sentence extracted from section A. Null if absent. */
  tldr: string | null;
  /** Role summary table parsed as key → value from the markdown table. */
  roleSummary: Record<string, string>;
};

/**
 * Output of parsing an `output/cv-{candidate}-{company}-{YYYY-MM-DD}.md`
 * tailored CV markdown file emitted by career-ops' `pdf` mode (step 11b
 * added by commit `c2efa0f`).
 */
export type ParsedTailoredCv = {
  candidate: string;
  company: string;
  /** ISO YYYY-MM-DD from frontmatter. */
  date: string;
  archetype: string;
  targetRole: string;
  /** 0–100 integer from frontmatter. */
  keywordCoveragePct: number;
  jdUrl: string | null;
  /**
   * The full markdown body (everything after the frontmatter fences, leading
   * whitespace trimmed). Written verbatim into `cv_versions.markdown`.
   */
  markdownBody: string;
  /**
   * Content of the `## Professional Summary` section — text between that
   * heading and the next `## ` heading, trimmed. For detail-page preview.
   */
  summary: string;
};

/** Output of parsing an `output/cv-*-*-*.pdf` or `.md` filename. */
export type ParsedOutputFilename = {
  /** Original filename, e.g. `"cv-mayowa-adeogun-globaldata-2026-04-24.pdf"`. */
  filename: string;
  kind: "pdf" | "markdown";
  /** Kebab-case candidate slug, e.g. `"mayowa-adeogun"`. */
  candidateSlug: string;
  /** Kebab-case company slug, e.g. `"globaldata"`. */
  companySlug: string;
  /** ISO YYYY-MM-DD. */
  date: string;
};

/** Structured parse failure. Never thrown — always returned. */
export type ParseError = {
  kind: "ParseError";
  file: string;
  reason: string;
};

/** Discriminated union: success carries a value, failure carries an error. */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ParseError };
