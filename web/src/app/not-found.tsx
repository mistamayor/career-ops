import { AppShell } from "@/components/app-shell";

export default function NotFound() {
  return (
    <AppShell title="Not found">
      <div className="p-6">
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          No match for this path.
        </div>
      </div>
    </AppShell>
  );
}
