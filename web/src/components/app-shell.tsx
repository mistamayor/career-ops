import { formatDistanceToNow } from "date-fns";

import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getSyncState } from "@/lib/pb";

import { MobileNav } from "./mobile-nav";
import { NavItemList } from "./sidebar-nav";

/**
 * App shell — sidebar + topbar + main content area.
 *
 * Server component by design: the only pieces that need client interactivity
 * (active-state highlighting, mobile toggle) are extracted into <NavItemList />
 * and <MobileNav />, both of which this shell mounts as leaf components.
 *
 * Responsive behaviour:
 * - lg+  : full 240px sidebar with icons + labels.
 * - md   : 64px icons-only sidebar (labels appear on hover via `title`).
 * - < md : sidebar hidden; topbar shows a hamburger that opens <MobileNav />.
 */

type AppShellProps = {
  title: string;
  children: React.ReactNode;
};

export function AppShell({ title, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function DesktopSidebar() {
  return (
    <aside className="bg-sidebar text-sidebar-foreground hidden border-r md:flex md:w-16 md:flex-col lg:w-60">
      <div className="flex h-14 items-center border-b px-3 lg:px-4">
        <span className="hidden text-sm font-semibold tracking-tight lg:inline">
          Career-Ops
        </span>
        <span className="text-sm font-semibold lg:hidden" aria-label="Career-Ops">
          C·O
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 lg:p-3">
        {/* md breakpoint renders compact (icon-only); lg+ renders expanded */}
        <div className="lg:hidden">
          <NavItemList variant="compact" />
        </div>
        <div className="hidden lg:block">
          <NavItemList variant="expanded" />
        </div>
      </div>

      <SidebarFooter />
    </aside>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t p-3 lg:p-4">
      {/* Compact footer on md: just the connection dot. */}
      <div className="flex items-center justify-center lg:hidden">
        <span
          className="inline-block h-2 w-2 rounded-full bg-emerald-500"
          aria-label="Connected to itfac3-us"
        />
      </div>

      {/* Expanded footer on lg+. */}
      <div className="hidden flex-col gap-2 text-xs lg:flex">
        <span className="text-muted-foreground">Career-Ops Web · v0.1</span>
        <Separator />
        <span className="text-muted-foreground flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full bg-emerald-500"
            aria-hidden
          />
          Connected to itfac3-us
        </span>
      </div>
    </div>
  );
}

async function Topbar({ title }: { title: string }) {
  return (
    <header className="bg-background flex h-14 items-center gap-3 border-b px-4">
      <MobileNav />
      <h1 className="truncate text-sm font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-3">
        <LastSyncChip />
        <div className="w-full max-w-xs">
          <Input
            type="search"
            placeholder="Search applications… (coming in v2)"
            disabled
            aria-label="Search"
          />
        </div>
      </div>
    </header>
  );
}

async function LastSyncChip() {
  const state = await getSyncState().catch(() => null);
  if (!state) {
    return (
      <span className="text-muted-foreground hidden text-xs md:inline">
        Never synced
      </span>
    );
  }
  const when = formatDistanceToNow(new Date(state.last_sync_at), {
    addSuffix: true,
  });
  const hasErrors = state.last_sync_errors > 0;
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 text-xs md:inline-flex",
        hasErrors ? "text-red-600" : "text-muted-foreground",
      )}
      title={`${state.last_sync_trigger} · ${state.last_sync_duration_ms}ms`}
    >
      {hasErrors && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-red-500"
        />
      )}
      Last sync: {when}
    </span>
  );
}
