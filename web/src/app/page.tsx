import { AppShell } from "@/components/app-shell";
import { listApplications } from "@/lib/pb";

export default async function PipelinePage() {
  const apps = await listApplications();

  return (
    <AppShell title="Pipeline">
      <div className="p-6">
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          Kanban lands in Prompt 5 — {apps.length} applications loaded from
          PocketBase.
        </div>
      </div>
    </AppShell>
  );
}
