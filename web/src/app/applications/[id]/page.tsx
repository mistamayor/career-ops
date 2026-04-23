import { AppShell } from "@/components/app-shell";
import { getApplication } from "@/lib/pb";

export default async function ApplicationDetailPage({
  params,
}: {
  // Next.js 15+ makes params a Promise; must await before accessing.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = await getApplication(id);

  return (
    <AppShell title={`${app.company} — ${app.role}`}>
      <div className="space-y-3 p-6">
        <p className="text-sm">
          <span className="font-medium">{app.company}</span>
          <span className="text-muted-foreground"> · </span>
          {app.role}
          <span className="text-muted-foreground"> · </span>
          <span className="text-muted-foreground">status:</span> {app.status}
          <span className="text-muted-foreground"> · </span>
          <span className="text-muted-foreground">fit_score:</span>{" "}
          {app.fit_score}
        </p>
        <p className="text-muted-foreground text-xs">
          Detail UI lands in Prompt 5.
        </p>
      </div>
    </AppShell>
  );
}
