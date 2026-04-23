"use client";

/**
 * Desktop sidebar nav. Client component only so we can read `usePathname()`
 * for active-state highlighting — no other state lives here.
 *
 * Rendering is shared with <MobileNav /> via the `NavItemList` component.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { isNavItemActive, navItems, type NavItem } from "./nav-items";

type Variant = "expanded" | "compact";

export type NavItemListProps = {
  variant: Variant;
  onNavigate?: () => void;
};

/**
 * Shared rendering of nav links. `expanded` shows icon + label; `compact`
 * shows icon only (used by the md breakpoint where the sidebar is 64px wide).
 */
export function NavItemList({ variant, onNavigate }: NavItemListProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isNavItemActive(pathname, item.href)}
          variant={variant}
          onClick={onNavigate}
        />
      ))}
    </nav>
  );
}

function NavLink({
  item,
  active,
  variant,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  variant: Variant;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={variant === "compact" ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground font-medium",
        variant === "expanded" ? "px-3 py-2" : "justify-center px-2 py-2",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {variant === "expanded" && <span>{item.label}</span>}
    </Link>
  );
}
