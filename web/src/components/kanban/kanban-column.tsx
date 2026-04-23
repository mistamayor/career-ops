"use client";

/**
 * Kanban column — droppable zone + header + card list. The header shows the
 * status label and a count badge; the body is an always-visible `SortableContext`
 * so cards can be dragged across columns without re-parenting the DOM.
 *
 * Background tints follow the user's Phase-0 brief: slight green for offer,
 * slight red for rejected, muted for withdrawn, neutral for the rest.
 */

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ApplicationsStatusOptions as ApplicationsStatusType } from "@/lib/pb-types";
import type { ApplicationWithCvVersion } from "@/lib/pb";

import { KanbanCard } from "./kanban-card";

const COLUMN_TINT: Partial<Record<ApplicationsStatusType, string>> = {
  offer: "bg-emerald-50/50 dark:bg-emerald-950/20",
  rejected: "bg-red-50/40 dark:bg-red-950/20",
  withdrawn: "bg-muted/40",
};

export function KanbanColumn({
  status,
  label,
  items,
}: {
  status: ApplicationsStatusType;
  label: string;
  items: ApplicationWithCvVersion[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      data-status={status}
      className={cn(
        "flex min-w-[280px] flex-col rounded-md border transition-colors",
        COLUMN_TINT[status] ?? "bg-background",
        isOver && "ring-ring ring-2",
      )}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">{label}</h2>
        <Badge variant="secondary" className="ml-2">
          {items.length}
        </Badge>
      </div>

      <SortableContext
        id={status}
        items={items.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2 p-2 min-h-24">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center text-xs py-6">
              No applications
            </p>
          ) : (
            items.map((app) => <KanbanCard key={app.id} application={app} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}
