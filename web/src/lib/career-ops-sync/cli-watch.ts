/**
 * tsx-runnable watcher CLI. Does an initial syncAll on startup (to catch
 * anything written while the watcher was down), then watches
 * CAREER_OPS_DIR for changes and re-syncs on each debounced burst.
 *
 * Handles SIGINT/SIGTERM cleanly: closes the chokidar instance, logs, exits 0.
 */

import { resolve } from "node:path";

import PocketBase from "pocketbase";

import { Collections } from "@/lib/pb-types";
import type { CvTemplatesResponse, TypedPocketBase } from "@/lib/pb-types";

import { syncAll } from "./sync-all";
import { watchCareerOps, writeSyncState } from "./watch";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    console.error(`[watch:cli] missing env: ${name}`);
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
    console.error("[watch:cli] no cv_templates — run `npm run pb:seed`");
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
  console.log(`[watch:cli] PB=${pbUrl}`);
  console.log(`[watch:cli] CAREER_OPS_DIR=${careerOpsDir}`);

  await pb.collection(Collections.Superusers).authWithPassword(email, password);
  const templateId = await findDefaultTemplateId(pb);

  // Initial sync on startup to pick up anything that landed while the
  // watcher wasn't running.
  console.log("[watch:cli] initial sync…");
  try {
    const result = await syncAll(pb, careerOpsDir, templateId);
    await writeSyncState(pb, result, "cli");
  } catch (err) {
    console.error(
      `[watch:cli] initial sync failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let lastSyncAt = new Date().toISOString();
  const watcher = watchCareerOps(pb, careerOpsDir, {
    defaultTemplateId: templateId,
    onSync: () => {
      lastSyncAt = new Date().toISOString();
    },
  });

  // Heartbeat every 60s.
  const heartbeat = setInterval(() => {
    console.log(`[watch] alive, last sync at ${lastSyncAt}`);
  }, 60_000);

  const shutdown = async (sig: string) => {
    console.log(`[watch] shutting down (${sig})`);
    clearInterval(heartbeat);
    await watcher.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error(`[watch:cli] fatal: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
