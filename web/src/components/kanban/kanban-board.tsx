/**
 * Server entry point for the Kanban. Fetches applications once on the server
 * and hands them to the client component that owns drag/drop + optimistic
 * state. Revalidation via server actions re-invokes this boundary and
 * re-renders with fresh data.
 */

import { listApplications } from "@/lib/pb";

import { KanbanClient } from "./kanban-client";

export async function KanbanBoard() {
  const applications = await listApplications();
  return <KanbanClient applications={applications} />;
}
