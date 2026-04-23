import {
  FileText,
  Kanban,
  LayoutTemplate,
  Loader,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * Primary app navigation. The `Pipeline` entry deliberately stays active on
 * `/applications/[id]` detail routes — they're part of the same conceptual
 * area. Everything else uses a prefix match on its own href.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navItems: readonly NavItem[] = [
  { href: "/", label: "Pipeline", icon: Kanban },
  { href: "/cvs", label: "CVs", icon: FileText },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/jobs", label: "Jobs", icon: Loader },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/" || pathname.startsWith("/applications");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
