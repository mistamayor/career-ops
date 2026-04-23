"use client";

/**
 * Client-side action widgets for the application detail page:
 * - <StatusChangeSelect /> — shadcn Select that calls changeStatusAction.
 * - <PinToggleButton />    — Star-icon button that calls togglePinnedAction.
 *
 * Both optimistically update local state, fall back to server state on
 * failure, and surface errors via sonner toasts.
 */

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";

import {
  changeStatusAction,
  togglePinnedAction,
} from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ApplicationsStatusOptions } from "@/lib/pb-types";
import type { ApplicationsStatusOptions as ApplicationsStatusType } from "@/lib/pb-types";

const STATUS_LABELS: Record<ApplicationsStatusType, string> = {
  discovered: "Discovered",
  evaluated: "Evaluated",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_ORDER: ApplicationsStatusType[] = [
  ApplicationsStatusOptions.discovered,
  ApplicationsStatusOptions.evaluated,
  ApplicationsStatusOptions.applied,
  ApplicationsStatusOptions.interview,
  ApplicationsStatusOptions.offer,
  ApplicationsStatusOptions.rejected,
  ApplicationsStatusOptions.withdrawn,
];

export function StatusChangeSelect({
  id,
  initialStatus,
}: {
  id: string;
  initialStatus: ApplicationsStatusType;
}) {
  const [status, setStatus] = useState<ApplicationsStatusType>(initialStatus);
  const [, startTransition] = useTransition();

  function onChange(nextRaw: string | null) {
    if (nextRaw === null) return;
    const next = nextRaw as ApplicationsStatusType;
    if (next === status) return;
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await changeStatusAction(id, next);
      if (!result.success) {
        setStatus(previous);
        toast.error(`Failed: ${result.error}`);
      } else {
        toast.success(`Status → ${STATUS_LABELS[next]}`);
      }
    });
  }

  return (
    <Select value={status} onValueChange={onChange}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_ORDER.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PinToggleButton({
  id,
  initialPinned,
}: {
  id: string;
  initialPinned: boolean;
}) {
  const [pinned, setPinned] = useState(initialPinned);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const previous = pinned;
    setPinned(!previous);
    startTransition(async () => {
      const result = await togglePinnedAction(id);
      if (!result.success) {
        setPinned(previous);
        toast.error(`Failed: ${result.error}`);
      } else {
        setPinned(result.pinned);
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={isPending}
      aria-label={pinned ? "Unpin" : "Pin"}
    >
      <Star
        className={cn(
          "h-4 w-4",
          pinned && "fill-amber-400 text-amber-500",
        )}
      />
    </Button>
  );
}
