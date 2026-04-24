/**
 * Idempotent upsert for `applications` records.
 *
 * - Match incoming parsed report against existing PB records by natural
 *   key (applicationKey, slug(company)::slug(role)).
 * - If no match → CREATE with fields derived from the report, and emit an
 *   `evaluated` event.
 * - If match → diff a narrow allowlist of fields (score, archetype,
 *   report body, etc.). Update iff any differ and emit an `evaluated`
 *   event with `re_evaluation: true`. No diff → SKIP, no writes, no event.
 *
 * User-owned fields (status, notes, pinned, applied_at) are NEVER touched
 * after initial creation — if a user has moved a card to "applied", a
 * re-evaluation must not silently reset it to "evaluated".
 */

import { Collections, EventsTypeOptions } from "@/lib/pb-types";
import type {
  ApplicationsResponse,
  ApplicationsStatusOptions,
  TypedPocketBase,
} from "@/lib/pb-types";

import { applicationKey, findExistingApplication } from "./natural-keys";
import type { ParsedReport } from "./types";

/**
 * Common result shape for upserts. `fieldsChanged` is empty for
 * `created` (everything is new) and for `skipped` (nothing changed);
 * non-empty for `updated` (enumerates exactly what the diff caught).
 */
export type UpsertResult<T> = {
  action: "created" | "updated" | "skipped";
  record: T;
  fieldsChanged: string[];
};

/** Fields we update on re-evaluation. User-owned fields are excluded. */
const UPDATE_ALLOWLIST = [
  "fit_score",
  "archetype",
  "comp_range",
  "location",
  "evaluation_report_md",
  "evaluation_report_path",
  "cv_version",
  "jd_url",
] as const;

type MutableApplicationFields = {
  fit_score: number;
  archetype: string;
  comp_range: string;
  location: string;
  evaluation_report_md: string;
  evaluation_report_path: string;
  cv_version: string;
  jd_url: string;
};

/**
 * Initial status policy for a brand-new application. Career-ops only
 * emits reports AFTER evaluating, so the initial status is always
 * `evaluated`. Kept as its own function so the policy is explicit and
 * easy to change if we ever ingest discovered-but-not-yet-evaluated JDs.
 */
function deriveInitialStatus(): ApplicationsStatusOptions {
  return "evaluated";
}

function logOperation(
  action: UpsertResult<unknown>["action"],
  key: string,
  fields: string[],
): void {
  const suffix = fields.length > 0 ? ` fields=[${fields.join(",")}]` : "";
  console.log(`[sync:application] ${action.toUpperCase()} key=${key}${suffix}`);
}

/**
 * Upsert an application from a parsed evaluation report. Emits an
 * `evaluated` event on CREATE and on UPDATE (never on SKIP).
 *
 * @param pb           authenticated TypedPocketBase
 * @param report       parsed evaluation report (from parseReport)
 * @param cvVersionId  id of the matching cv_version, or null if none
 */
export async function upsertApplication(
  pb: TypedPocketBase,
  report: ParsedReport,
  cvVersionId: string | null,
  reportFilename: string,
): Promise<UpsertResult<ApplicationsResponse>> {
  const key = applicationKey(report);

  const existing = findExistingApplication(
    await pb.collection(Collections.Applications).getFullList(),
    report,
  );

  const mutablePayload: MutableApplicationFields = {
    fit_score: report.score,
    archetype: report.archetype,
    comp_range: report.roleSummary["Contract"] ?? "",
    location: report.roleSummary["Location"] ?? "",
    evaluation_report_md: report.rawMarkdown,
    evaluation_report_path: reportFilename,
    cv_version: cvVersionId ?? "",
    jd_url: report.jdUrl ?? "",
  };

  if (!existing) {
    const created = await pb
      .collection(Collections.Applications)
      .create<ApplicationsResponse>({
        company: report.company,
        role: report.role,
        jd_text: "",
        jd_source: "career-ops-scan",
        status: deriveInitialStatus(),
        applied_at: "",
        notes: "",
        pinned: false,
        ...mutablePayload,
      });

    await emitEvaluatedEvent(pb, created.id, report, false);
    logOperation("created", key, []);
    return { action: "created", record: created, fieldsChanged: [] };
  }

  // Diff the allowlisted fields only. Treat `undefined` / `null` as empty
  // string on existing side so comparison is stable.
  const changed: string[] = [];
  for (const field of UPDATE_ALLOWLIST) {
    const prev = normalise((existing as unknown as Record<string, unknown>)[field]);
    const next = normalise(mutablePayload[field]);
    if (prev !== next) changed.push(field);
  }

  if (changed.length === 0) {
    logOperation("skipped", key, []);
    return { action: "skipped", record: existing, fieldsChanged: [] };
  }

  const patch: Partial<MutableApplicationFields> = {};
  for (const field of changed) {
    (patch as Record<string, unknown>)[field] =
      mutablePayload[field as keyof MutableApplicationFields];
  }

  const updated = await pb
    .collection(Collections.Applications)
    .update<ApplicationsResponse>(existing.id, patch);

  await emitEvaluatedEvent(pb, updated.id, report, true);
  logOperation("updated", key, changed);
  return { action: "updated", record: updated, fieldsChanged: changed };
}

function normalise(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  // PB strips trailing whitespace on text fields at store time; compare
  // trailing-whitespace-stripped forms to avoid spurious diffs on re-sync.
  return String(v).replace(/\s+$/u, "");
}

async function emitEvaluatedEvent(
  pb: TypedPocketBase,
  applicationId: string,
  report: ParsedReport,
  reEvaluation: boolean,
): Promise<void> {
  const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(report.date)
    ? `${report.date}T00:00:00.000Z`
    : new Date().toISOString();

  const payload: Record<string, unknown> = {
    sequence: report.sequenceNumber,
    score: report.score,
  };
  if (reEvaluation) payload["re_evaluation"] = true;

  await pb.collection(Collections.Events).create({
    application: applicationId,
    type: EventsTypeOptions.evaluated,
    occurred_at: occurredAt,
    payload,
  });
}
