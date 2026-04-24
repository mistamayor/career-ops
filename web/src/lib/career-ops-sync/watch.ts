/**
 * File-system watcher for career-ops outputs. Uses chokidar to observe
 * markdown files under `reports/` and markdown/PDF files under `output/`
 * within CAREER_OPS_DIR, then runs `syncAll` after a debounce so the
 * multi-file burst career-ops emits per run coalesces into one sync.
 *
 * The watcher never crashes on a sync failure — errors are logged and
 * the watch loop keeps running so a subsequent career-ops run can
 * recover state.
 */

import chokidar from "chokidar";

import { Collections } from "@/lib/pb-types";
import type {
  SyncStateResponse,
  TypedPocketBase,
} from "@/lib/pb-types";

import { syncAll, type SyncAllResult } from "./sync-all";

export type SyncTrigger = "manual" | "watch" | "cli";

export type AbortableWatcher = {
  close(): Promise<void>;
};

export type WatchOptions = {
  debounceMs?: number;
  /** Called after each completed sync (success or failure). */
  onSync?: (result: SyncAllResult) => void;
  /** Id of the default cv_template (mayor-classic). */
  defaultTemplateId: string;
};

const DEFAULT_DEBOUNCE_MS = 2000;

/**
 * Persist the last sync result into the singleton sync_state row.
 * Creates the row on first call, updates it on every subsequent call.
 * Failures here are non-fatal — logged but never rethrown — so a bad
 * sync_state write doesn't crash the watcher.
 */
export async function writeSyncState(
  pb: TypedPocketBase,
  result: SyncAllResult,
  trigger: SyncTrigger,
): Promise<void> {
  try {
    const all = await pb
      .collection(Collections.SyncState)
      .getFullList<SyncStateResponse>();
    const payload = {
      last_sync_at: new Date().toISOString(),
      last_sync_applications_created: result.applications.created,
      last_sync_applications_updated: result.applications.updated,
      last_sync_applications_skipped: result.applications.skipped,
      last_sync_cv_versions_created: result.cvVersions.created,
      last_sync_cv_versions_updated: result.cvVersions.updated,
      last_sync_cv_versions_skipped: result.cvVersions.skipped,
      last_sync_errors: result.errors.length,
      last_sync_duration_ms: result.durationMs,
      last_sync_trigger: trigger,
    };
    if (all.length === 0) {
      await pb.collection(Collections.SyncState).create(payload);
    } else {
      await pb.collection(Collections.SyncState).update(all[0].id, payload);
    }
  } catch (err) {
    console.warn(
      `[watch] failed to persist sync_state: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Start watching career-ops output directories. Returns a handle whose
 * `close()` detaches the watcher and resolves when chokidar has released
 * its resources.
 */
export function watchCareerOps(
  pb: TypedPocketBase,
  careerOpsDir: string,
  options: WatchOptions,
): AbortableWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const reportsDir = `${careerOpsDir}/reports`;
  const outputDir = `${careerOpsDir}/output`;

  // chokidar v5 watches paths directly; the `ignored` callback filters
  // events. Accept: *.md under reports/ and *.{md,pdf} under output/.
  // Reject: directories themselves (chokidar fires add for them too),
  // hidden files, .gitkeep, node_modules.
  const watcher = chokidar.watch([reportsDir, outputDir], {
    ignored: (p, stats) => {
      if (p.includes("/node_modules/")) return true;
      if (/(^|\/)\.[^/]/.test(p)) return true;
      if (p.endsWith("/.gitkeep")) return true;
      // If we know it's a file (stats provided), require a tracked extension.
      if (stats?.isFile()) {
        const isReport = p.startsWith(reportsDir) && p.endsWith(".md");
        const isOutput =
          p.startsWith(outputDir) && (p.endsWith(".md") || p.endsWith(".pdf"));
        if (!isReport && !isOutput) return true;
      }
      return false;
    },
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
  });

  let debounceTimer: NodeJS.Timeout | null = null;
  let running = false;
  let pending = false;

  async function doSync(): Promise<void> {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      console.log("[watch] syncing…");
      const result = await syncAll(pb, careerOpsDir, options.defaultTemplateId);
      const a = result.applications;
      const v = result.cvVersions;
      console.log(
        `[watch] synced: apps c=${a.created}/u=${a.updated}/s=${a.skipped} | ` +
          `cvs c=${v.created}/u=${v.updated}/s=${v.skipped} | ` +
          `errors=${result.errors.length} in ${result.durationMs}ms`,
      );
      await writeSyncState(pb, result, "watch");
      options.onSync?.(result);
    } catch (err) {
      console.error(
        `[watch:error] syncAll threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
      );
    } finally {
      running = false;
      if (pending) {
        pending = false;
        // Re-run once to cover events that arrived mid-run.
        setTimeout(() => void doSync(), 50);
      }
    }
  }

  function trigger(eventPath: string): void {
    console.log(`[watch] change: ${eventPath.split("/").slice(-2).join("/")}`);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void doSync();
    }, debounceMs);
  }

  watcher.on("add", trigger);
  watcher.on("change", trigger);

  watcher.on("ready", () => {
    console.log(
      `[watch] watching ${careerOpsDir}/reports and ${careerOpsDir}/output ` +
        `(debounce=${debounceMs}ms)`,
    );
  });

  watcher.on("error", (err) => {
    console.error(
      `[watch:error] chokidar: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  return {
    async close() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await watcher.close();
    },
  };
}
