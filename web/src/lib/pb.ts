import "server-only";

/**
 * Server-only PocketBase client. Per PLAN.md §2 decision #8, the browser
 * never talks to PocketBase directly — every read and write goes through
 * this module, which authenticates as a superuser using env creds.
 *
 * Typed via the `TypedPocketBase` alias emitted by pocketbase-typegen
 * (`src/lib/pb-types.ts`). Expand generics on the Response types give us
 * typed joins for relations we commonly fetch together (`cv_version` on
 * applications; `template` + `parent` on cv_versions).
 *
 * Phase 0 write surface: application create + status change + generic patch.
 * Kanban + New-Application flows live on top of these. Event-emitting writes
 * (create, status change) record their own timeline entries; the caller
 * does not need to.
 */

import PocketBase from "pocketbase";
import {
  Collections,
  EventsTypeOptions,
  type ApplicationsResponse,
  type ApplicationsStatusOptions,
  type Create,
  type CvTemplatesResponse,
  type CvVersionsResponse,
  type EventsResponse,
  type JobsResponse,
  type TypedPocketBase,
  type Update,
} from "./pb-types";

// ---------------------------------------------------------------------------
// Public row types — Response + typed expand.
// ---------------------------------------------------------------------------

/** Application with its tailored CV version pre-joined via `expand`. */
export type ApplicationWithCvVersion = ApplicationsResponse<{
  cv_version?: CvVersionsResponse;
}>;

/** CV version with its template + parent base version pre-joined. */
export type CvVersionWithRelations = CvVersionsResponse<{
  template?: CvTemplatesResponse;
  parent?: CvVersionsResponse;
}>;

// ---------------------------------------------------------------------------
// Singleton + auth
// ---------------------------------------------------------------------------

let cachedClient: TypedPocketBase | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") {
    throw new Error(
      `Missing required env: ${name}. Set it in web/.env.local.`,
    );
  }
  return v;
}

async function authenticate(pb: TypedPocketBase): Promise<void> {
  const email = requireEnv("POCKETBASE_ADMIN_EMAIL");
  const password = requireEnv("POCKETBASE_ADMIN_PASSWORD");
  await pb
    .collection(Collections.Superusers)
    .authWithPassword(email, password);
}

/**
 * Returns an authenticated, per-process PocketBase singleton.
 *
 * The client is constructed lazily on first call and reused across
 * subsequent requests in the same Node process. If the auth token has
 * expired (or was never set), we re-authenticate before returning.
 *
 * Next.js serverless-edge semantics: each server boundary gets its own
 * module instance, so the singleton is scoped to a given runtime worker —
 * not shared across workers or regions. Auth cost per worker is one
 * round-trip on first use.
 */
export async function getPb(): Promise<TypedPocketBase> {
  if (cachedClient === null) {
    const url = requireEnv("NEXT_PUBLIC_POCKETBASE_URL");
    cachedClient = new PocketBase(url) as TypedPocketBase;
  }
  if (!cachedClient.authStore.isValid) {
    await authenticate(cachedClient);
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Read helpers — Phase 0 surface only.
// ---------------------------------------------------------------------------

type ListOptions = {
  filter?: string;
  sort?: string;
};

export async function listApplications(
  options: ListOptions = {},
): Promise<ApplicationWithCvVersion[]> {
  const pb = await getPb();
  return pb
    .collection(Collections.Applications)
    .getFullList<ApplicationWithCvVersion>({
      sort: "-created",
      ...options,
      expand: "cv_version",
    });
}

export async function getApplication(
  id: string,
): Promise<ApplicationWithCvVersion> {
  const pb = await getPb();
  return pb
    .collection(Collections.Applications)
    .getOne<ApplicationWithCvVersion>(id, { expand: "cv_version" });
}

export async function listCvVersions(
  options: ListOptions = {},
): Promise<CvVersionWithRelations[]> {
  const pb = await getPb();
  return pb
    .collection(Collections.CvVersions)
    .getFullList<CvVersionWithRelations>({
      sort: "-created",
      ...options,
      expand: "template,parent",
    });
}

export async function listCvTemplates(): Promise<CvTemplatesResponse[]> {
  const pb = await getPb();
  return pb
    .collection(Collections.CvTemplates)
    .getFullList({ sort: "-is_default,name" });
}

export async function listJobs(
  options: ListOptions = {},
): Promise<JobsResponse[]> {
  const pb = await getPb();
  return pb.collection(Collections.Jobs).getFullList({
    sort: "-created",
    ...options,
  });
}

export async function listEvents(
  applicationId: string,
): Promise<EventsResponse[]> {
  const pb = await getPb();
  return pb.collection(Collections.Events).getFullList({
    filter: pb.filter("application = {:appId}", { appId: applicationId }),
    sort: "-occurred_at",
  });
}

// ---------------------------------------------------------------------------
// Write helpers — Phase 0 surface only (applications + their events).
// ---------------------------------------------------------------------------

export type ApplicationCreate = Create<"applications">;
export type ApplicationUpdate = Update<"applications">;

/**
 * Create an application and an accompanying `created` timeline event.
 *
 * If the event write fails (e.g., transient PB hiccup), the application is
 * still persisted — we log a warning and return the application. The event
 * is strictly secondary to the record and can be reconstructed from the
 * application's `created` timestamp in a later reconciliation pass.
 */
export async function createApplication(
  data: ApplicationCreate,
): Promise<ApplicationsResponse> {
  const pb = await getPb();
  const app = await pb
    .collection(Collections.Applications)
    .create<ApplicationsResponse>(data);

  try {
    await pb.collection(Collections.Events).create({
      application: app.id,
      type: EventsTypeOptions.created,
      occurred_at: new Date().toISOString(),
      payload: null,
    });
  } catch (err) {
    console.warn(
      `[pb] created application ${app.id} but failed to write created-event:`,
      err instanceof Error ? err.message : err,
    );
  }

  return app;
}

/**
 * Change an application's status, emit a `status_changed` event, and
 * (conditionally) stamp `applied_at` + emit an `applied` event when the
 * new status is `applied` and `applied_at` wasn't set yet.
 *
 * Returns the updated record. Throws on the status update itself; secondary
 * writes (events, applied_at backfill) are best-effort with warnings.
 */
export async function updateApplicationStatus(
  id: string,
  status: ApplicationsStatusOptions,
): Promise<ApplicationsResponse> {
  const pb = await getPb();

  const existing = await pb
    .collection(Collections.Applications)
    .getOne<ApplicationsResponse>(id);
  const oldStatus = existing.status;

  const patch: ApplicationUpdate = { status };
  const needsAppliedAtBackfill =
    status === "applied" && (existing.applied_at ?? "") === "";
  if (needsAppliedAtBackfill) {
    patch.applied_at = new Date().toISOString();
  }

  const updated = await pb
    .collection(Collections.Applications)
    .update<ApplicationsResponse>(id, patch);

  const now = new Date().toISOString();

  try {
    await pb.collection(Collections.Events).create({
      application: id,
      type: EventsTypeOptions.status_changed,
      occurred_at: now,
      payload: { from: oldStatus, to: status },
    });
  } catch (err) {
    console.warn(
      `[pb] status updated on ${id} but status_changed event failed:`,
      err instanceof Error ? err.message : err,
    );
  }

  if (status === "applied") {
    try {
      await pb.collection(Collections.Events).create({
        application: id,
        type: EventsTypeOptions.applied,
        occurred_at: now,
        payload: null,
      });
    } catch (err) {
      console.warn(
        `[pb] status=applied on ${id} but applied event failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return updated;
}

/**
 * Generic patch — use for notes edits, pinned toggle, comp_range tweaks, etc.
 * Does not emit timeline events; caller is responsible for any eventing.
 */
export async function updateApplication(
  id: string,
  patch: Partial<ApplicationUpdate>,
): Promise<ApplicationsResponse> {
  const pb = await getPb();
  return pb
    .collection(Collections.Applications)
    .update<ApplicationsResponse>(id, patch);
}
