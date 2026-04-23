import "server-only";

/**
 * Server-only PocketBase client. Per PLAN.md §2 decision #8, the browser
 * never talks to PocketBase directly — every read goes through this module,
 * which authenticates as a superuser using env creds.
 *
 * Typed via the `TypedPocketBase` alias emitted by pocketbase-typegen
 * (`src/lib/pb-types.ts`). Expand generics on the Response types give us
 * typed joins for relations we commonly fetch together (`cv_version` on
 * applications; `template` + `parent` on cv_versions).
 *
 * Create/update helpers are intentionally absent for Phase 0 — they land
 * alongside the features that need them in Phase 1 and Phase 2.
 */

import PocketBase from "pocketbase";
import {
  Collections,
  type ApplicationsResponse,
  type CvTemplatesResponse,
  type CvVersionsResponse,
  type EventsResponse,
  type JobsResponse,
  type TypedPocketBase,
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
  // No default sort: the jobs collection currently has no `created` autodate
  // field (PocketBase v0.23+ treats autodates as opt-in and the Phase 0 schema
  // didn't include them). Add a sort — likely by `started_at` — in Phase 3
  // alongside the job runner, once that field is populated.
  return pb.collection(Collections.Jobs).getFullList(options);
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
