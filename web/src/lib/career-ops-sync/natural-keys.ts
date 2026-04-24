/**
 * Natural keys and matching helpers. Pure functions — no IO.
 *
 * The sync layer identifies "the same application across re-runs" by a
 * deterministic natural key derived from (company, role). Re-running
 * career-ops on the same JD is expected to produce a matching key and
 * therefore an UPDATE (or SKIP), never a second row.
 *
 * For cv_versions we key on (candidate, company, date): re-running on the
 * same day is idempotent; re-running on a different day creates a distinct
 * version — exactly what we want for the tailored-CV history.
 *
 * We don't persist the natural key as a column (schema is frozen in
 * Phase 0). Matching derives the key from both the parsed input and the
 * existing PB record; for cv_versions we additionally round-trip through
 * the generated `label`, which is our deterministic write-side encoding.
 */

import type { ParsedReport, ParsedTailoredCv } from "./types";

/**
 * Normalise arbitrary strings to a kebab-case slug. Unicode accents are
 * stripped (NFD decomposition + removing combining marks), non-alphanumeric
 * runs collapse to single hyphens, and leading/trailing hyphens are
 * trimmed.
 *
 * @example
 *   slug("GlobalData Plc")   // "globaldata-plc"
 *   slug("Head of IT")       // "head-of-it"
 *   slug("Café & Cie")       // "cafe-cie"
 */
export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Natural key for an application: `${slug(company)}::${slug(role)}`.
 * Identifies "the same opening across re-runs" — company + role is the
 * smallest pair that's distinctive in practice.
 */
export function applicationKey(
  record: { company: string; role: string },
): string {
  return `${slug(record.company)}::${slug(record.role)}`;
}

/**
 * Natural key for a cv_version: `${slug(candidate)}::${slug(company)}::${date}`.
 * Same-day re-runs collide intentionally (idempotent); different-day
 * re-runs produce distinct versions we keep as tailored-CV history.
 */
export function cvVersionKey(cv: ParsedTailoredCv): string {
  return `${slug(cv.candidate)}::${slug(cv.company)}::${cv.date}`;
}

/**
 * Deterministic human-readable label for a cv_version PB record. Generated
 * by the upsert layer, parsed only implicitly via `findExistingCvVersion`
 * (we compare labels string-equality since we're the sole writer).
 */
export function cvVersionLabel(cv: ParsedTailoredCv): string {
  return `Tailored — ${cv.company} ${cv.targetRole} (${cv.date})`;
}

/**
 * Find an existing application by natural key match. `company` and `role`
 * are read from the candidate record and slugged the same way as the
 * incoming report's values.
 */
export function findExistingApplication<T extends { company: string; role: string }>(
  applications: readonly T[],
  report: ParsedReport,
): T | null {
  const key = applicationKey(report);
  return applications.find((a) => applicationKey(a) === key) ?? null;
}

/**
 * Find an existing cv_version by exact label match. Since `cvVersionLabel`
 * is deterministic (and we're the only writer), label equality round-trips
 * the natural key reliably without needing a separate stored column.
 */
export function findExistingCvVersion<T extends { label: string }>(
  versions: readonly T[],
  cv: ParsedTailoredCv,
): T | null {
  const expectedLabel = cvVersionLabel(cv);
  return versions.find((v) => v.label === expectedLabel) ?? null;
}
