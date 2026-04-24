import { AppShell } from "@/components/app-shell";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { NewApplicationDialog } from "@/components/new-application-dialog";
import { SyncNowButton } from "@/components/sync-now-button";

export default async function PipelinePage() {
  return (
    <AppShell title="Pipeline">
      <div className="flex items-center justify-end gap-2 px-4 pt-4">
        <SyncNowButton />
        <NewApplicationDialog />
      </div>
      <KanbanBoard />
    </AppShell>
  );
}
