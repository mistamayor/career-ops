/**
 * In-memory fake of `TypedPocketBase` for unit tests. Purely for testing
 * the upsert / sync layer in isolation from a real PocketBase instance.
 *
 * Scope is intentionally narrow: supports `getFullList`, `getOne`, `create`,
 * `update`, and `getFirstListItem` on the `applications`, `cv_versions`,
 * `events`, and `cv_templates` collections. Production code imports
 * `@/lib/pb` instead; this helper is never loaded at runtime.
 *
 * Not in `__fixtures__/` because it isn't a static fixture — it's a
 * runnable stub. Not in `.test.ts` because vitest's include pattern
 * (`*.test.ts`) would try to execute it as a test file.
 */

import type {
  ApplicationsResponse,
  CollectionResponses,
  CvTemplatesResponse,
  CvVersionsResponse,
  EventsResponse,
  TypedPocketBase,
} from "@/lib/pb-types";

type Stored =
  | ApplicationsResponse
  | CvVersionsResponse
  | EventsResponse
  | CvTemplatesResponse;

type AnyPayload = Record<string, unknown>;

export type FakePbState = {
  applications: ApplicationsResponse[];
  cv_versions: CvVersionsResponse[];
  events: EventsResponse[];
  cv_templates: CvTemplatesResponse[];
};

export type FakePbHandle = {
  pb: TypedPocketBase;
  state: FakePbState;
  /** Reset all tracked collections between tests. */
  reset(): void;
};

function genId(prefix: string, counter: { n: number }): string {
  counter.n += 1;
  return `${prefix}_${counter.n.toString(36).padStart(4, "0")}`;
}

/**
 * Flatten a FormData body into a plain object so the in-memory fake can
 * spread it into a record. File parts surface as the uploaded filename
 * string (PB's API returns stored filenames, not Blobs, after upload).
 */
function flatten(data: AnyPayload | FormData): AnyPayload {
  if (data instanceof FormData) {
    const obj: AnyPayload = {};
    for (const [k, v] of data.entries()) {
      if (typeof v === "string") {
        obj[k] = v;
      } else {
        // File / Blob — record the filename (PB stores hashed-name after
        // upload, but "non-empty string" is all our diff logic needs).
        const file = v as { name?: string };
        obj[k] = file.name ?? "uploaded-file";
      }
    }
    return obj;
  }
  return data;
}

function nowIso(): string {
  return new Date().toISOString();
}

function systemFields(id: string, collectionName: string) {
  return {
    id,
    collectionId: `coll_${collectionName}`,
    collectionName,
    created: nowIso(),
    updated: nowIso(),
  };
}

/** Creates a fresh fake. Each test gets its own isolated state. */
export function makeFakePb(seed: Partial<FakePbState> = {}): FakePbHandle {
  const state: FakePbState = {
    applications: [...(seed.applications ?? [])],
    cv_versions: [...(seed.cv_versions ?? [])],
    events: [...(seed.events ?? [])],
    cv_templates: [...(seed.cv_templates ?? [])],
  };
  const idCounter = { n: 0 };

  function coll(name: keyof FakePbState) {
    return {
      getFullList: async <T extends Stored>(): Promise<T[]> =>
        [...state[name]] as unknown as T[],
      getOne: async <T extends Stored>(id: string): Promise<T> => {
        const hit = (state[name] as Stored[]).find((r) => r.id === id);
        if (!hit) {
          throw Object.assign(new Error(`not found: ${name}/${id}`), {
            status: 404,
          });
        }
        return hit as unknown as T;
      },
      getFirstListItem: async <T extends Stored>(): Promise<T> => {
        const list = state[name] as Stored[];
        if (list.length === 0) {
          throw Object.assign(new Error(`empty: ${name}`), { status: 404 });
        }
        return list[0] as unknown as T;
      },
      create: async <T extends Stored>(data: AnyPayload | FormData): Promise<T> => {
        const flat = flatten(data);
        const id = (flat.id as string) || genId(name.slice(0, 3), idCounter);
        const record = {
          ...flat,
          ...systemFields(id, name),
        } as unknown as T;
        (state[name] as Stored[]).push(record as unknown as Stored);
        return record;
      },
      update: async <T extends Stored>(
        id: string,
        patch: AnyPayload | FormData,
      ): Promise<T> => {
        const list = state[name] as Stored[];
        const idx = list.findIndex((r) => r.id === id);
        if (idx === -1) {
          throw Object.assign(new Error(`not found for update: ${name}/${id}`), {
            status: 404,
          });
        }
        const next = {
          ...list[idx],
          ...flatten(patch),
          updated: nowIso(),
        } as Stored;
        list[idx] = next;
        return next as unknown as T;
      },
      delete: async (id: string): Promise<boolean> => {
        const list = state[name] as Stored[];
        const idx = list.findIndex((r) => r.id === id);
        if (idx === -1) return false;
        list.splice(idx, 1);
        return true;
      },
    };
  }

  const pb = {
    collection: (name: keyof CollectionResponses | string) => {
      // Narrow the union of accepted names to our supported buckets.
      if (
        name === "applications" ||
        name === "cv_versions" ||
        name === "events" ||
        name === "cv_templates"
      ) {
        return coll(name) as unknown as ReturnType<TypedPocketBase["collection"]>;
      }
      throw new Error(`FakePb: unsupported collection "${String(name)}"`);
    },
    authStore: { isValid: true, clear() {} },
    // PB's `filter()` does template substitution; our fake just returns the
    // raw template since no query exercises the filter in unit tests.
    filter: (raw: string) => raw,
  } as unknown as TypedPocketBase;

  return {
    pb,
    state,
    reset(): void {
      state.applications.length = 0;
      state.cv_versions.length = 0;
      state.events.length = 0;
      state.cv_templates.length = 0;
      idCounter.n = 0;
    },
  };
}

/** Convenience: build a minimal ApplicationsResponse for seeding tests. */
export function fakeApplication(
  overrides: Partial<ApplicationsResponse> = {},
): ApplicationsResponse {
  return {
    id: "app_seed",
    collectionId: "coll_applications",
    collectionName: "applications",
    created: nowIso(),
    updated: nowIso(),
    company: "Acme",
    role: "Engineer",
    jd_url: "",
    jd_text: "",
    jd_source: "manual",
    fit_score: 0,
    status: "evaluated",
    cv_version: "",
    archetype: "",
    comp_range: "",
    location: "",
    applied_at: "",
    evaluation_report_md: "",
    evaluation_report_path: "",
    notes: "",
    pinned: false,
    ...overrides,
  } as ApplicationsResponse;
}

/** Convenience: build a minimal CvVersionsResponse for seeding tests. */
export function fakeCvVersion(
  overrides: Partial<CvVersionsResponse> = {},
): CvVersionsResponse {
  return {
    id: "cv_seed",
    collectionId: "coll_cv_versions",
    collectionName: "cv_versions",
    created: nowIso(),
    updated: nowIso(),
    label: "Base CV — Seed",
    source: "base",
    parent: "",
    markdown: "",
    pdf: "",
    template: "",
    target_archetype: "",
    ...overrides,
  } as CvVersionsResponse;
}
