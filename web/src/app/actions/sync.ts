"use server";

/**
 * Server Action backing the "Sync now" button on the Pipeline page.
 * Calls `syncAll` against CAREER_OPS_DIR with the current PB singleton,
 * persists sync_state, revalidates dependent routes, returns a structured
 * result for the client-side toast.
 */

import { revalidatePath } from "next/cache";

import { getPb } from "@/lib/pb";
import { Collections } from "@/lib/pb-types";
import type { CvTemplatesResponse } from "@/lib/pb-types";

import { syncAll, type SyncAllResult } from "@/lib/career-ops-sync/sync-all";
import { writeSyncState } from "@/lib/career-ops-sync/watch";

type Result =
  | { success: true; result: SyncAllResult }
  | { success: false; error: string };

export async function syncNowAction(): Promise<Result> {
  const careerOpsDir = process.env.CAREER_OPS_DIR;
  if (!careerOpsDir || careerOpsDir.trim() === "") {
    return { success: false, error: "CAREER_OPS_DIR not set" };
  }

  try {
    const pb = await getPb();
    const templates = await pb
      .collection(Collections.CvTemplates)
      .getFullList<CvTemplatesResponse>();
    const defaultTpl = templates.find((t) => t.is_default) ?? templates[0];
    if (!defaultTpl) {
      return { success: false, error: "no cv_templates — run pb:seed first" };
    }

    const result = await syncAll(pb, careerOpsDir, defaultTpl.id);
    await writeSyncState(pb, result, "manual");

    revalidatePath("/");
    revalidatePath("/cvs");
    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
