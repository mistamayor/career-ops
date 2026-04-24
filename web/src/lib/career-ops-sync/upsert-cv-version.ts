/**
 * Idempotent upsert for `cv_versions` records + (optional) PDF upload.
 *
 * Matching uses the generated label (`cvVersionLabel`): career-ops tailored
 * CVs are keyed by (candidate, company, date), and the label encodes the
 * same triple. Same-day re-runs hit the same label and skip; different-day
 * runs produce a new version.
 *
 * PDF handling:
 *   - CREATE + pdfPath !== null → upload via multipart/form-data.
 *   - UPDATE + existing has no pdf + pdfPath !== null → upload.
 *   - UPDATE + existing already has a pdf → skip the upload (we do not
 *     overwrite user-facing artefacts silently).
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { Collections } from "@/lib/pb-types";
import type {
  CvVersionsResponse,
  TypedPocketBase,
} from "@/lib/pb-types";

import {
  cvVersionKey,
  cvVersionLabel,
  findExistingCvVersion,
} from "./natural-keys";
import type { ParsedTailoredCv } from "./types";
import type { UpsertResult } from "./upsert-application";

const UPDATE_ALLOWLIST = ["label", "markdown", "target_archetype"] as const;

type MutableFields = {
  label: string;
  markdown: string;
  target_archetype: string;
};

function logOperation(
  action: UpsertResult<unknown>["action"],
  key: string,
  fields: string[],
): void {
  const suffix = fields.length > 0 ? ` fields=[${fields.join(",")}]` : "";
  console.log(`[sync:cv_version] ${action.toUpperCase()} key=${key}${suffix}`);
}

function normalise(v: unknown): string {
  if (v === null || v === undefined) return "";
  // PB trims trailing whitespace/newlines on text fields at store time, so
  // compare normalised forms to avoid spurious "markdown changed" diffs on
  // the second sync run.
  return String(v).replace(/\s+$/u, "");
}

/**
 * Build a FormData body for a cv_version record with an attached PDF.
 * Uses `global.FormData` + `global.File` — available in Node ≥18 without
 * imports, which PocketBase's SDK expects.
 */
async function buildFormDataWithPdf(
  fields: Record<string, string>,
  pdfPath: string,
): Promise<FormData> {
  const buf = await readFile(pdfPath);
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const blob = new Blob([buf], { type: "application/pdf" });
  // The third arg sets the upload filename PB records alongside the blob.
  fd.set("pdf", blob, basename(pdfPath));
  return fd;
}

/**
 * Upsert a tailored cv_version. Returns created/updated/skipped plus the
 * list of fields that diverged on update.
 *
 * @param pb                authenticated TypedPocketBase
 * @param cv                parsed tailored CV (from parseTailoredCv)
 * @param pdfPath           absolute path to the matching PDF, or null
 * @param defaultTemplateId id of the base template (e.g. "mayor-classic")
 */
export async function upsertCvVersion(
  pb: TypedPocketBase,
  cv: ParsedTailoredCv,
  pdfPath: string | null,
  defaultTemplateId: string,
): Promise<UpsertResult<CvVersionsResponse>> {
  const key = cvVersionKey(cv);
  const label = cvVersionLabel(cv);

  const allVersions = await pb
    .collection(Collections.CvVersions)
    .getFullList<CvVersionsResponse>();

  const existing = findExistingCvVersion(allVersions, cv);

  // Parent: the base cv_version, by convention the first source="base" entry.
  // Stays null if none exists yet — seed or real users can add one later.
  const parent = allVersions.find((v) => v.source === "base")?.id ?? "";

  if (!existing) {
    const baseFields: Record<string, string> = {
      label,
      source: "tailored",
      parent,
      markdown: cv.markdownBody,
      template: defaultTemplateId,
      target_archetype: cv.archetype,
    };

    let created: CvVersionsResponse;
    if (pdfPath !== null) {
      const fd = await buildFormDataWithPdf(baseFields, pdfPath);
      created = await pb
        .collection(Collections.CvVersions)
        .create<CvVersionsResponse>(fd);
    } else {
      created = await pb
        .collection(Collections.CvVersions)
        .create<CvVersionsResponse>(baseFields);
    }

    logOperation("created", key, []);
    return { action: "created", record: created, fieldsChanged: [] };
  }

  const mutable: MutableFields = {
    label,
    markdown: cv.markdownBody,
    target_archetype: cv.archetype,
  };

  const changed: string[] = [];
  for (const field of UPDATE_ALLOWLIST) {
    const prev = normalise((existing as unknown as Record<string, unknown>)[field]);
    const next = normalise(mutable[field]);
    if (prev !== next) changed.push(field);
  }

  const shouldUploadPdf =
    pdfPath !== null && normalise(existing.pdf) === "";

  if (changed.length === 0 && !shouldUploadPdf) {
    logOperation("skipped", key, []);
    return { action: "skipped", record: existing, fieldsChanged: [] };
  }

  const patch: Record<string, string> = {};
  for (const field of changed) {
    patch[field] = mutable[field as keyof MutableFields];
  }

  let updated: CvVersionsResponse;
  if (shouldUploadPdf && pdfPath !== null) {
    const fd = await buildFormDataWithPdf(patch, pdfPath);
    updated = await pb
      .collection(Collections.CvVersions)
      .update<CvVersionsResponse>(existing.id, fd);
    if (!changed.includes("pdf")) changed.push("pdf");
  } else {
    updated = await pb
      .collection(Collections.CvVersions)
      .update<CvVersionsResponse>(existing.id, patch);
  }

  logOperation("updated", key, changed);
  return { action: "updated", record: updated, fieldsChanged: changed };
}
