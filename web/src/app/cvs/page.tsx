import { AppShell } from "@/components/app-shell";
import { listCvVersions } from "@/lib/pb";

export default async function CvsPage() {
  const versions = await listCvVersions();

  return (
    <AppShell title="CVs">
      <div className="p-6">
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          CV Library — Phase 1. {versions.length} versions in database.
        </div>
      </div>
    </AppShell>
  );
}
