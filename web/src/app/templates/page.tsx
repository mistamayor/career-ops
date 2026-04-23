import { AppShell } from "@/components/app-shell";
import { listCvTemplates } from "@/lib/pb";

export default async function TemplatesPage() {
  const templates = await listCvTemplates();

  return (
    <AppShell title="Templates">
      <div className="p-6">
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          Templates — Phase 2. {templates.length} templates in database.
        </div>
      </div>
    </AppShell>
  );
}
