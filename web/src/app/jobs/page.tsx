import { AppShell } from "@/components/app-shell";
import { listJobs } from "@/lib/pb";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <AppShell title="Jobs">
      <div className="p-6">
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          Jobs — Phase 3. {jobs.length} jobs in database.
        </div>
      </div>
    </AppShell>
  );
}
