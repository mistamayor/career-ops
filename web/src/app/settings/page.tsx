import { AppShell } from "@/components/app-shell";

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <div className="p-6">
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          Settings — later.
        </div>
      </div>
    </AppShell>
  );
}
