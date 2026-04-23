"use client";

/**
 * Draggable application card for the Kanban. Clicking navigates to the
 * detail page; dragging (distance > 8px — configured on the sensor in
 * KanbanClient) triggers a status change.
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
  if (score >= 4.5) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100";
  if (score >= 4.0) return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
  return "bg-muted text-muted-foreground";
}

export function KanbanCard({
  application,
}: {
  application: ApplicationWithCvVersion;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: application.id });

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
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      <Link
        href={`/applications/${application.id}`}
        className="block space-y-1.5"
        onPointerDown={(e) => {
          // Let dnd-kit's PointerSensor handle drag initiation; the
          // activationConstraint (distance 8px) keeps pure clicks working.
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
    </div>
  );
}
