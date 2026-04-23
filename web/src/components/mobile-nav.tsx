"use client";

/**
 * Mobile nav trigger + overlay drawer. Lives in the topbar on sub-md screens
 * only; self-managed state (open/closed) keeps it isolated from the otherwise
 * server-rendered shell.
 *
 * Not using shadcn `Sheet` because we don't have that component installed and
 * the native approach is ~20 lines of JSX.
 */

import { useState } from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { NavItemList } from "./sidebar-nav";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="bg-background absolute top-0 left-0 flex h-full w-64 flex-col gap-4 border-r p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Career-Ops</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <NavItemList variant="expanded" onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
