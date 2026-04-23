"use client";

/**
 * Draggable application card for the Kanban.
 *
 * Two modes, switched by the `isOverlay` prop:
 *
 * - `isOverlay` unset (default): calls `useSortable` and renders the card
 *   with drag listeners wired. Clicking navigates to the detail page;
 *   dragging past the PointerSensor activation distance triggers a status
 *   change. When `isDragging` is true, the origin is faded to `opacity-40`
 *   so the floating DragOverlay clone reads as the "real" card.
 *
 * - `isOverlay` set: plain presentation with no drag hooks, no refs, no
 *   listeners. Used by:
 *     (a) `<DragOverlay>` clone — avoids nested sortables when the overlay
 *         renders the same component.
 *     (b) the pre-mount render in `KanbanClient` — dnd-kit never mounts on
 *         the server, which removes the a11y ID hydration mismatch.
 *
 * fit_score band colours: ≥4.5 emerald, 4.0–4.5 amber, <4.0 muted.
 */

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ApplicationWithCvVersion } from "@/lib/pb";

function fitScoreBadgeVariant(score: number | undefined): string {
  if (score === undefined) return "bg-muted text-muted-foreground";
  if (score >= 4.5)
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100";
  if (score >= 4.0)
    return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
  return "bg-muted text-muted-foreground";
}

/** Pure visual body — no hooks, no drag listeners. */
function CardBody({
  application,
}: {
  application: ApplicationWithCvVersion;
}) {
  return (
    <Link
      href={`/applications/${application.id}`}
      className="block space-y-1.5"
      onPointerDown={(e) => {
        // Let the outer drag listeners handle drag initiation; the
        // PointerSensor activation distance (5px) means a pure click stays a
        // click, so Link navigation still works.
        e.stopPropagation();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {application.company}
          </div>
          <div className="text-muted-foreground truncate text-xs">
            {application.role}
          </div>
        </div>
        {application.pinned && (
          <Star
            className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500"
            aria-label="Pinned"
          />
        )}
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        {application.fit_score !== undefined && application.fit_score !== 0 && (
          <Badge
            variant="outline"
            className={cn(
              "px-1.5 py-0 text-[10px]",
              fitScoreBadgeVariant(application.fit_score),
            )}
          >
            fit {application.fit_score.toFixed(1)}
          </Badge>
        )}
        {application.archetype && (
          <Badge
            variant="outline"
            className="text-muted-foreground px-1.5 py-0 text-[10px]"
          >
            {application.archetype}
          </Badge>
        )}
      </div>
    </Link>
  );
}

/** Plain card — no drag hooks. Used for the DragOverlay clone and the
 *  pre-mount render in `KanbanClient`. */
function PlainCard({
  application,
}: {
  application: ApplicationWithCvVersion;
}) {
  return (
    <div className="bg-card text-card-foreground rounded-md border p-3 shadow-lg">
      <CardBody application={application} />
    </div>
  );
}

/** Sortable card — drag listeners wired. Isolated from `PlainCard` so the
 *  hook call in `useSortable` is unconditional per-component (no early
 *  return above it). */
function SortableCard({
  application,
}: {
  application: ApplicationWithCvVersion;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "bg-card text-card-foreground touch-none select-none rounded-md border p-3 shadow-sm",
        isDragging && "opacity-40",
      )}
    >
      <CardBody application={application} />
    </div>
  );
}

export function KanbanCard({
  application,
  isOverlay = false,
}: {
  application: ApplicationWithCvVersion;
  isOverlay?: boolean;
}) {
  return isOverlay ? (
    <PlainCard application={application} />
  ) : (
    <SortableCard application={application} />
  );
}
