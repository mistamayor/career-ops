"use server";

/**
 * Server Actions for application CRUD from client components. All three
 * actions revalidate the relevant paths so server components re-fetch.
 *
 * Keep the shape tight: every action returns either a discriminated-union
 * success/error result or throws — never a mix. Also: Next.js requires every
 * export of a `"use server"` module to be an async function, so the shared
 * zod schema lives in `./applications-schema.ts`.
 */

import { revalidatePath } from "next/cache";

import {
  createApplication,
  updateApplication,
  updateApplicationStatus,
} from "@/lib/pb";
import type {
  ApplicationsStatusOptions,
  ApplicationsResponse,
} from "@/lib/pb-types";

import { applicationCreateSchema } from "./applications-schema";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

type CreateResult =
  | { success: true; id: string }
  | { success: false; error: string };

type StatusResult =
  | { success: true; application: ApplicationsResponse }
  | { success: false; error: string };

type PinnedResult =
  | { success: true; pinned: boolean }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createApplicationAction(
  formData: FormData,
): Promise<CreateResult> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = applicationCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { success: false, error: msg };
  }

  try {
    const data = parsed.data;
    const app = await createApplication({
      company: data.company,
      role: data.role,
      jd_url: data.jd_url ?? "",
      jd_text: data.jd_text ?? "",
      jd_source: data.jd_source,
      status: data.status,
    });
    revalidatePath("/");
    return { success: true, id: app.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function changeStatusAction(
  id: string,
  status: ApplicationsStatusOptions,
): Promise<StatusResult> {
  try {
    const app = await updateApplicationStatus(id, status);
    revalidatePath("/");
    revalidatePath(`/applications/${id}`);
    return { success: true, application: app };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function togglePinnedAction(id: string): Promise<PinnedResult> {
  try {
    const current = await (async () => {
      const { getApplication } = await import("@/lib/pb");
      return getApplication(id);
    })();
    const nextPinned = !current.pinned;
    await updateApplication(id, { pinned: nextPinned });
    revalidatePath("/");
    revalidatePath(`/applications/${id}`);
    return { success: true, pinned: nextPinned };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

