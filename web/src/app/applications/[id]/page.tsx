import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  PinToggleButton,
  StatusChangeSelect,
} from "@/components/application-actions";
import { AppShell } from "@/components/app-shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getApplication, listEvents } from "@/lib/pb";
import type { EventsResponse } from "@/lib/pb-types";

const EVENT_TYPE_LABELS: Record<string, string> = {
  created: "Created",
  evaluated: "Evaluated",
  applied: "Applied",
  interview_scheduled: "Interview scheduled",
  interview_done: "Interview done",
  rejected: "Rejected",
  offer_received: "Offer received",
  offer_accepted: "Offer accepted",
  offer_declined: "Offer declined",
  withdrawn: "Withdrawn",
  note_added: "Note added",
  status_changed: "Status changed",
};

function eventSubtext(evt: EventsResponse): string | null {
  if (evt.type !== "status_changed") return null;
  const payload = evt.payload as
    | { from?: string; to?: string }
    | null
    | undefined;
  if (!payload || !payload.from || !payload.to) return null;
  const from = EVENT_TYPE_LABELS[payload.from] ?? payload.from;
  const to = EVENT_TYPE_LABELS[payload.to] ?? payload.to;
  return `from ${from} to ${to}`;
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [app, events] = await Promise.all([getApplication(id), listEvents(id)]);

  return (
    <AppShell title={`${app.company} — ${app.role}`}>
      <div className="p-6">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Pipeline
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="space-y-4 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {app.company}
                </h1>
                <p className="text-muted-foreground">{app.role}</p>
              </div>
              <PinToggleButton id={app.id} initialPinned={!!app.pinned} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {app.fit_score !== undefined && app.fit_score > 0 && (
                <Badge variant="outline" className="text-xs">
                  fit {app.fit_score.toFixed(1)}
                </Badge>
              )}
              {app.archetype && (
                <Badge variant="outline" className="text-xs">
                  {app.archetype}
                </Badge>
              )}
              {app.location && (
                <Badge variant="outline" className="text-xs">
                  {app.location}
                </Badge>
              )}
              {app.comp_range && (
                <Badge variant="outline" className="text-xs">
                  {app.comp_range}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm">Status:</span>
              <StatusChangeSelect id={app.id} initialStatus={app.status} />
            </div>

            {app.expand?.cv_version && (
              <div className="text-sm">
                <span className="text-muted-foreground">CV version: </span>
                <Link
                  href="/cvs"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {app.expand.cv_version.label}
                </Link>
              </div>
            )}

            {app.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Notes</CardTitle>
                </CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">
                  {app.notes}
                </CardContent>
              </Card>
            )}

            {app.jd_text && (
              <Accordion className="mt-2">
                <AccordionItem value="jd">
                  <AccordionTrigger className="text-sm">
                    Job description
                  </AccordionTrigger>
                  <AccordionContent className="text-sm whitespace-pre-wrap">
                    {app.jd_text}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>

          {/* Event timeline sidebar */}
          <aside className="space-y-3">
            <h2 className="text-sm font-medium">Timeline</h2>
            <Separator />
            {events.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No events recorded.
              </p>
            ) : (
              <ol className="space-y-3">
                {events.map((evt) => {
                  const subtext = eventSubtext(evt);
                  return (
                    <li
                      key={evt.id}
                      className="border-l-muted-foreground/30 border-l-2 pl-3"
                    >
                      <div className="text-sm font-medium">
                        {EVENT_TYPE_LABELS[evt.type] ?? evt.type}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(evt.occurred_at), {
                          addSuffix: true,
                        })}
                      </div>
                      {subtext && (
                        <div className="text-muted-foreground text-xs">
                          {subtext}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
