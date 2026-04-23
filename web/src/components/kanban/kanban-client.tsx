"use client";

/**
 * Client-side Kanban controller. Owns the applications array (seeded from
 * the server render), dnd-kit sensors/context, and the optimistic status
 * update flow: move the card locally → fire the server action → revert and
 * toast on failure.
 *
 * Column order matches PLAN.md §4 status progression: Discovered → Evaluated
 * → Applied → Interview → Offer → Rejected → Withdrawn.
 *
 * SSR strategy: mount-gated. The server and the first client render produce
 * a plain non-interactive Kanban (same visual structure, no dnd-kit hooks).
 * After hydration completes, `useEffect` flips `mounted=true` and we render
 * the full `DndContext` + `SortableContext` tree. This sidesteps dnd-kit's
 * module-level a11y ID counter which otherwise causes a hydration mismatch
 * that React 19 can't patch up — and which breaks event listener attachment
 * as a consequence.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";

import { changeStatusAction } from "@/app/actions/applications";
import {
  ApplicationsStatusOptions,
  type ApplicationsStatusOptions as ApplicationsStatusType,
} from "@/lib/pb-types";
import type { ApplicationWithCvVersion } from "@/lib/pb";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";

import { KanbanCard } from "./kanban-card";
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

const COLUMN_TINT: Partial<Record<ApplicationsStatusType, string>> = {
  offer: "bg-emerald-50/50 dark:bg-emerald-950/20",
  rejected: "bg-red-50/40 dark:bg-red-950/20",
  withdrawn: "bg-muted/40",
};

function isStatus(value: string): value is ApplicationsStatusType {
  return (COLUMN_ORDER as readonly string[]).includes(value);
}

export function KanbanClient({
  applications: initial,
}: {
  applications: ApplicationWithCvVersion[];
}) {
  // ---- Hooks: ALL declared at the top, unconditionally ------------------
  const [mounted, setMounted] = useState(false);
  const [apps, setApps] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [activeCard, setActiveCard] =
    useState<ApplicationWithCvVersion | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Canonical SSR mount-gate: flip to `true` on first client effect so the
  // post-hydration render swaps in the full DndContext tree. The lint rule
  // fires on the setState line itself (not the effect wrapper), so the
  // disable comment sits immediately above it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Server revalidation sync: if parent passes a new `initial`, reset local
  // state to it. "Reset state during render" pattern — not an effect.
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setApps(initial);
  }

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

  const cardToStatus = useMemo(() => {
    const m = new Map<string, ApplicationsStatusType>();
    for (const a of apps) m.set(a.id, a.status);
    return m;
  }, [apps]);

  // ---- Handlers ---------------------------------------------------------

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const found = apps.find((a) => a.id === id) ?? null;
    setActiveCard(found);
  }

  function handleDragCancel() {
    setActiveCard(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    // Clear overlay first — irrespective of drop outcome.
    setActiveCard(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromStatus = cardToStatus.get(activeId);
    if (!fromStatus) return;

    // over.id is either a column status string (dropped on empty column)
    // or another card's id (dropped on a specific card). Resolve to a
    // destination status.
    const toStatus = isStatus(overId) ? overId : cardToStatus.get(overId);
    if (!toStatus || toStatus === fromStatus) return;

    const previous = apps;

    // Optimistic move.
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

  // ---- Render -----------------------------------------------------------

  // Pre-mount render: plain columns + cards, no dnd-kit. Matches SSR so
  // hydration is clean. Swapped out for the full DndContext tree on the
  // first post-hydration render.
  if (!mounted) {
    return (
      <div className="flex gap-3 overflow-x-auto p-4">
        {columns.map((col) => (
          <div
            key={col.status}
            data-status={col.status}
            className={cn(
              "flex min-w-[280px] flex-col rounded-md border",
              COLUMN_TINT[col.status] ?? "bg-background",
            )}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h2 className="text-sm font-medium">{col.label}</h2>
              <Badge variant="secondary" className="ml-2">
                {col.items.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 p-2 min-h-24">
              {col.items.length === 0 ? (
                <p className="text-muted-foreground text-center text-xs py-6">
                  No applications
                </p>
              ) : (
                col.items.map((app) => (
                  <KanbanCard key={app.id} application={app} isOverlay />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
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

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
        }}
      >
        {activeCard ? (
          <KanbanCard application={activeCard} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
