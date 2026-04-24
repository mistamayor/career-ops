/**
 * Walk a career-ops directory, group report/cv-md/pdf artefacts into
 * triples, and run `syncOne` for each. Produces aggregate counts.
 *
 * Matching policy (report → cv-md/pdf):
 *   1. Build `knownCompanySlugs` from existing PB applications to
 *      disambiguate multi-word company slugs (parseOutputFilename option).
 *   2. For each report, slug its company, find the cv markdowns whose
 *      parsed `companySlug` matches, and pick the one with the latest
 *      date that is >= the report's date. Same for PDFs.
 *   3. If no cv markdown is found, sync application-only and log a warning.
 */

import { readFile } from "node:fs/promises";

import type { TypedPocketBase } from "@/lib/pb-types";
import { Collections } from "@/lib/pb-types";

import { slug } from "./natural-keys";
import { parseOutputFilename } from "./parse-output-filename";
import { parseReport } from "./parse-report";
import { findCareerOpsArtefacts, type OutputFileRef } from "./read-fixtures";
import { syncOne, type SyncOneResult } from "./sync-one";

export type SyncAllResult = {
  totalReports: number;
  applications: { created: number; updated: number; skipped: number };
  cvVersions: { created: number; updated: number; skipped: number };
  errors: Array<{ file: string; reason: string }>;
  durationMs: number;
};

/**
 * Run a full sync of everything under `careerOpsDir`.
 *
 * @param pb                  authenticated TypedPocketBase
 * @param careerOpsDir        absolute path to the career-ops repo root
 * @param defaultTemplateId   id of the default cv_template (mayor-classic)
 */
export async function syncAll(
  pb: TypedPocketBase,
  careerOpsDir: string,
  defaultTemplateId: string,
): Promise<SyncAllResult> {
  const start = Date.now();

  const applications = await pb
    .collection(Collections.Applications)
    .getFullList();
  const knownCompanySlugs = [
    ...new Set(applications.map((a) => slug(a.company)).filter((s) => s !== "")),
  ];

  const artefacts = await findCareerOpsArtefacts(careerOpsDir);
  console.log(
    `[sync:all] found reports=${artefacts.reports.length} ` +
      `cv_markdowns=${artefacts.cvMarkdowns.length} pdfs=${artefacts.pdfs.length} ` +
      `known_companies=${knownCompanySlugs.length}`,
  );

  const result: SyncAllResult = {
    totalReports: artefacts.reports.length,
    applications: { created: 0, updated: 0, skipped: 0 },
    cvVersions: { created: 0, updated: 0, skipped: 0 },
    errors: [],
    durationMs: 0,
  };

  for (const report of artefacts.reports) {
    const parsed = parseReport(report.filename, report.content);
    if (!parsed.ok) {
      result.errors.push({
        file: report.filename,
        reason: parsed.error.reason,
      });
      continue;
    }
    const companySlug = slug(parsed.value.company);
    const reportDate = parsed.value.date;

    const cvMd = pickMatchingOutput(
      artefacts.cvMarkdowns,
      companySlug,
      reportDate,
      knownCompanySlugs,
    );
    // Once we've picked a CV markdown, prefer a PDF that sits on the same
    // date — career-ops writes both files in the same run, so co-dated
    // output is the strongest signal that they're paired.
    const pdf = cvMd
      ? pickMatchingOutputByExactDate(
          artefacts.pdfs,
          companySlug,
          fileDate(cvMd.filename),
          knownCompanySlugs,
        ) ??
        pickMatchingOutput(artefacts.pdfs, companySlug, reportDate, knownCompanySlugs)
      : pickMatchingOutput(artefacts.pdfs, companySlug, reportDate, knownCompanySlugs);

    if (!cvMd) {
      console.warn(
        `[sync:all] report ${report.filename} has no matching cv markdown — ` +
          `syncing application only`,
      );
    }

    const cvMarkdownContent = cvMd ? await readFile(cvMd.path, "utf8") : null;

    const oneResult = await syncOne(pb, {
      reportFilename: report.filename,
      reportContent: report.content,
      cvMarkdownFilename: cvMd?.filename ?? null,
      cvMarkdownContent,
      pdfPath: pdf?.path ?? null,
      defaultTemplateId,
    });

    accumulate(result, oneResult);
  }

  result.durationMs = Date.now() - start;
  logSummary(result);
  return result;
}

/**
 * Pick the output (md or pdf) whose parsed companySlug matches and whose
 * date is the latest that is >= `reportDate`. Falls back to any match if
 * none are ≥ date (career-ops might have been run earlier too).
 */
function pickMatchingOutput(
  outputs: OutputFileRef[],
  reportCompanySlug: string,
  reportDate: string,
  knownCompanySlugs: string[],
): OutputFileRef | null {
  const matches = outputs.filter((o) => {
    const p = parseOutputFilename(o.filename, { knownCompanySlugs });
    return p.ok && companySlugMatches(reportCompanySlug, p.value.companySlug);
  });
  if (matches.length === 0) return null;

  const sorted = [...matches].sort((a, b) => {
    const da = dateFromFilename(a.filename) ?? "";
    const db = dateFromFilename(b.filename) ?? "";
    return db.localeCompare(da);
  });
  // Prefer the most recent that is >= reportDate.
  const onOrAfter = sorted.find(
    (o) => (dateFromFilename(o.filename) ?? "") >= reportDate,
  );
  return onOrAfter ?? sorted[0];
}

function pickMatchingOutputByExactDate(
  outputs: OutputFileRef[],
  reportCompanySlug: string,
  date: string | null,
  knownCompanySlugs: string[],
): OutputFileRef | null {
  if (!date) return null;
  return (
    outputs.find((o) => {
      if (fileDate(o.filename) !== date) return false;
      const p = parseOutputFilename(o.filename, { knownCompanySlugs });
      return p.ok && companySlugMatches(reportCompanySlug, p.value.companySlug);
    }) ?? null
  );
}

function dateFromFilename(filename: string): string | null {
  const m = /(\d{4}-\d{2}-\d{2})\.(?:md|pdf)$/.exec(filename);
  return m ? m[1] : null;
}

const fileDate = dateFromFilename;

/**
 * Loose match between the report's company slug and the file's company
 * slug. Handles the common case where career-ops strips corporate
 * suffixes (Plc, Ltd, Inc) from filenames but preserves them in the
 * report's `# Evaluation:` header. Accepts an exact match OR a
 * prefix-with-hyphen relationship in either direction.
 */
function companySlugMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith(`${b}-`)) return true;
  if (b.startsWith(`${a}-`)) return true;
  return false;
}

function accumulate(result: SyncAllResult, one: SyncOneResult): void {
  for (const err of one.errors) {
    result.errors.push({ file: one.reportFilename, reason: err });
  }
  if (one.application) {
    result.applications[one.application.action] += 1;
  }
  if (one.cvVersion) {
    result.cvVersions[one.cvVersion.action] += 1;
  }
}

function logSummary(result: SyncAllResult): void {
  const a = result.applications;
  const v = result.cvVersions;
  console.log(
    `[sync:all] done in ${result.durationMs}ms — ` +
      `applications: created=${a.created} updated=${a.updated} skipped=${a.skipped} | ` +
      `cv_versions: created=${v.created} updated=${v.updated} skipped=${v.skipped} | ` +
      `errors=${result.errors.length}`,
  );
}
