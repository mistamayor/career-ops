"use client";

/**
 * Client-side Kanban controller. Owns the applications array (seeded from
 * the server render), dnd-kit sensors/context, and the optimistic status
 * update flow: move the card locally → fire the server action → revert and
 * toast on failure.
 *
 * Column order matches PLAN.md §4 status progression: Discovered → Evaluated
 * → Applied → Interview → Offer → Rejected → Withdrawn.
 */

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";

import { changeStatusAction } from "@/app/actions/applications";
import {
  ApplicationsStatusOptions,
  type ApplicationsStatusOptions as ApplicationsStatusType,
} from "@/lib/pb-types";
import type { ApplicationWithCvVersion } from "@/lib/pb";

import { KanbanColumn } from "./kanban-column";

const COLUMN_ORDER: readonly ApplicationsStatusType[] = [
  ApplicationsStatusOptions.discovered,
  ApplicationsStatusOptions.evaluated,
  ApplicationsStatusOptions.applied,
  ApplicationsStatusOptions.interview,
  ApplicationsStatusOptions.offer,
  ApplicationsStatusOptions.rejected,
  ApplicationsStatusOptions.withdrawn,
] as const;

const STATUS_LABELS: Record<ApplicationsStatusType, string> = {
  discovered: "Discovered",
  evaluated: "Evaluated",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

function isStatus(value: string): value is ApplicationsStatusType {
  return (COLUMN_ORDER as readonly string[]).includes(value);
}

export function KanbanClient({
  applications: initial,
}: {
  applications: ApplicationWithCvVersion[];
}) {
  const [apps, setApps] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [, startTransition] = useTransition();

  // Re-sync if the server component re-renders with fresh data after a
  // revalidatePath. Uses the "reset state during render" pattern — we
  // compare the incoming prop to the last one we accepted; if they differ,
  // queue a re-render with fresh state. This avoids the set-state-in-effect
  // antipattern and stays in sync with server-driven revalidations.
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setApps(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const columns = useMemo(() => {
    const byStatus = new Map<ApplicationsStatusType, ApplicationWithCvVersion[]>();
    for (const s of COLUMN_ORDER) byStatus.set(s, []);
    for (const a of apps) {
      const bucket = byStatus.get(a.status);
      if (bucket) bucket.push(a);
    }
    return COLUMN_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      items: byStatus.get(status) ?? [],
    }));
  }, [apps]);

  // Lookup: card id → current column, for resolving drops onto other cards.
  const cardToStatus = useMemo(() => {
    const m = new Map<string, ApplicationsStatusType>();
    for (const a of apps) m.set(a.id, a.status);
    return m;
  }, [apps]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromStatus = cardToStatus.get(activeId);
    if (!fromStatus) return;

    // over.id is either a column status string (dropped on empty column)
    // or another card's id (dropped on a specific card). Resolve to a
    // destination status.
    const toStatus = isStatus(overId)
      ? overId
      : cardToStatus.get(overId);
    if (!toStatus || toStatus === fromStatus) return;

    // Snapshot for rollback.
    const previous = apps;

    // Optimistic update: move the card into the new status locally.
    setApps((prev) =>
      prev.map((a) => (a.id === activeId ? { ...a, status: toStatus } : a)),
    );

    startTransition(async () => {
      const result = await changeStatusAction(activeId, toStatus);
      if (!result.success) {
        setApps(previous);
        toast.error(
          `Failed to move card: ${result.error || "unknown error"}`,
        );
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto p-4">
        {columns.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            label={col.label}
            items={col.items}
          />
        ))}
      </div>
    </DndContext>
  );
}
