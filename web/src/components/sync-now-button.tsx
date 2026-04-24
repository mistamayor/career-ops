"use client";

/**
 * Client wrapper for the syncNowAction Server Action. Kept tiny: button
 * + spinner + toast. Server Action itself does all the work.
 */

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { syncNowAction } from "@/app/actions/sync";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncNowButton() {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const r = await syncNowAction();
      if (!r.success) {
        toast.error(`Sync failed: ${r.error}`);
        return;
      }
      const a = r.result.applications;
      const v = r.result.cvVersions;
      const newCount = a.created + v.created;
      const updatedCount = a.updated + v.updated;
      const skippedCount = a.skipped + v.skipped;
      toast.success(
        `Synced: ${newCount} new, ${updatedCount} updated, ${skippedCount} skipped`,
      );
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={isPending}
      aria-label="Sync career-ops outputs"
    >
      <RefreshCw className={cn("mr-1 h-4 w-4", isPending && "animate-spin")} />
      {isPending ? "Syncing…" : "Sync now"}
    </Button>
  );
}
