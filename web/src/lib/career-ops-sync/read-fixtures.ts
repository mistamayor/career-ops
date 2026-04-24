/**
 * Filesystem layer for the sync engine. Walks a career-ops directory and
 * returns references to the three canonical artefact kinds:
 *
 *   - reports/NNN-*-YYYY-MM-DD.md             → read into memory (small text files)
 *   - output/cv-*-*-YYYY-MM-DD.md              → read into memory (small text files)
 *   - output/cv-*-*-YYYY-MM-DD.pdf             → metadata only (binaries are lazy)
 *
 * This is the only module in `career-ops-sync/` that touches `fs`. Parsers
 * remain pure; upserts take parsed structures or file refs and pull
 * binary data on demand (e.g. when uploading a PDF).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const REPORT_FILENAME_RE = /^(\d{3})-.+-\d{4}-\d{2}-\d{2}\.md$/;
const CV_MD_FILENAME_RE = /^cv-.+-\d{4}-\d{2}-\d{2}\.md$/;
const CV_PDF_FILENAME_RE = /^cv-.+-\d{4}-\d{2}-\d{2}\.pdf$/;

/** A parsed evaluation report file — content is read into memory. */
export type ReportFileRef = {
  path: string;
  filename: string;
  content: string;
};

/**
 * A cv_* output file. Content is not read eagerly — markdown files pull
 * content when needed, PDFs stay on disk until upload time.
 */
export type OutputFileRef = {
  path: string;
  filename: string;
  mtime: Date;
  sizeBytes: number;
};

export type CareerOpsArtefactSet = {
  reports: ReportFileRef[];
  cvMarkdowns: OutputFileRef[];
  pdfs: OutputFileRef[];
};

/**
 * Extract the leading 3-digit sequence number from a report filename.
 * Throws on malformed inputs — only called after regex-validation.
 */
function seqNumberFromReportFilename(filename: string): number {
  const m = REPORT_FILENAME_RE.exec(filename);
  if (!m) {
    throw new Error(`seqNumberFromReportFilename: filename doesn't match pattern: ${filename}`);
  }
  return Number.parseInt(m[1], 10);
}

/** Extract the trailing YYYY-MM-DD date from any of our known filenames. */
function dateFromFilename(filename: string): string | null {
  const m = /(\d{4}-\d{2}-\d{2})\.(?:md|pdf)$/.exec(filename);
  return m ? m[1] : null;
}

/**
 * Walk `{careerOpsDir}/reports/` and `{careerOpsDir}/output/` and return
 * every artefact that matches the canonical filename patterns, sorted
 * deterministically (reports by sequence number, outputs by date DESC
 * then filename ASC so newest-first reads are natural).
 *
 * @example
 *   const set = await findCareerOpsArtefacts("/path/to/career-ops");
 *   //   → { reports: [...], cvMarkdowns: [...], pdfs: [...] }
 */
export async function findCareerOpsArtefacts(
  careerOpsDir: string,
): Promise<CareerOpsArtefactSet> {
  const reportsDir = join(careerOpsDir, "reports");
  const outputDir = join(careerOpsDir, "output");

  const [reportEntries, outputEntries] = await Promise.all([
    safeReaddir(reportsDir),
    safeReaddir(outputDir),
  ]);

  const reports: ReportFileRef[] = [];
  for (const filename of reportEntries) {
    if (!REPORT_FILENAME_RE.test(filename)) continue;
    const path = join(reportsDir, filename);
    const content = await readFile(path, "utf8");
    reports.push({ path, filename, content });
  }
  reports.sort(
    (a, b) => seqNumberFromReportFilename(a.filename) - seqNumberFromReportFilename(b.filename),
  );

  const cvMarkdowns: OutputFileRef[] = [];
  const pdfs: OutputFileRef[] = [];
  for (const filename of outputEntries) {
    const isMd = CV_MD_FILENAME_RE.test(filename);
    const isPdf = CV_PDF_FILENAME_RE.test(filename);
    if (!isMd && !isPdf) continue;
    const path = join(outputDir, filename);
    const s = await stat(path);
    const ref: OutputFileRef = {
      path,
      filename,
      mtime: s.mtime,
      sizeBytes: s.size,
    };
    (isMd ? cvMarkdowns : pdfs).push(ref);
  }
  sortOutputsDateDescThenFilenameAsc(cvMarkdowns);
  sortOutputsDateDescThenFilenameAsc(pdfs);

  return { reports, cvMarkdowns, pdfs };
}

function sortOutputsDateDescThenFilenameAsc(refs: OutputFileRef[]): void {
  refs.sort((a, b) => {
    const da = dateFromFilename(a.filename) ?? "";
    const db = dateFromFilename(b.filename) ?? "";
    if (da !== db) return db.localeCompare(da); // desc
    return a.filename.localeCompare(b.filename); // asc
  });
}

async function safeReaddir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (e) {
    if (isNotFoundError(e)) return [];
    throw e;
  }
}

function isNotFoundError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "ENOENT"
  );
}
