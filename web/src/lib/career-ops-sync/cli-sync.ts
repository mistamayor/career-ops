/**
 * tsx-runnable entry point for the sync engine. Invoked via `npm run sync`.
 *
 * Reads env from `.env.local` (via dotenv-cli in package.json),
 * authenticates the PocketBase client via the Phase 0 `getPb()` helper's
 * internals, and walks `CAREER_OPS_DIR` to upsert artefacts into PB.
 *
 * This script does NOT import `@/lib/pb` — that module carries a
 * `server-only` import that throws outside Next.js's server runtime.
 * We construct our own PocketBase client here.
 */

import { resolve } from "node:path";

import PocketBase from "pocketbase";

import { Collections } from "@/lib/pb-types";
import type { CvTemplatesResponse, TypedPocketBase } from "@/lib/pb-types";

import { syncAll } from "./sync-all";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    console.error(`[sync:cli] missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function findDefaultTemplateId(pb: TypedPocketBase): Promise<string> {
  const templates = await pb
    .collection(Collections.CvTemplates)
    .getFullList<CvTemplatesResponse>();
  const def = templates.find((t) => t.is_default) ?? templates[0];
  if (!def) {
    console.error(
      "[sync:cli] no cv_templates rows in PocketBase — run `npm run pb:seed` first",
    );
    process.exit(1);
  }
  return def.id;
}

async function main(): Promise<void> {
  const pbUrl = requireEnv("NEXT_PUBLIC_POCKETBASE_URL");
  const email = requireEnv("POCKETBASE_ADMIN_EMAIL");
  const password = requireEnv("POCKETBASE_ADMIN_PASSWORD");
  const careerOpsDir = resolve(requireEnv("CAREER_OPS_DIR"));

  const pb = new PocketBase(pbUrl) as TypedPocketBase;
  console.log(`[sync:cli] PocketBase=${pbUrl}`);
  console.log(`[sync:cli] CAREER_OPS_DIR=${careerOpsDir}`);

  try {
    await pb.collection(Collections.Superusers).authWithPassword(email, password);
  } catch (e) {
    console.error(
      `[sync:cli] superuser auth failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  }

  const defaultTemplateId = await findDefaultTemplateId(pb);

  const result = await syncAll(pb, careerOpsDir, defaultTemplateId);

  if (result.errors.length > 0) {
    console.error(`[sync:cli] completed with ${result.errors.length} errors:`);
    for (const err of result.errors) {
      console.error(`  - ${err.file}: ${err.reason}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(`[sync:cli] unexpected error: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
