"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  MessageSquare,
  Server,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { resolveServiceIcon } from "@/lib/service-icons";
import { useRegistryServices } from "@/lib/use-settings";
import { useServices } from "@/lib/use-services";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Overview, AI Assistant and Settings are fixed. Every service comes from the services table.
const TOP_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/services", label: "All services", icon: Server },
];
const BOTTOM_ITEMS: NavItem[] = [
  { href: "/assistant", label: "AI Assistant", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

const STATUS_DOT: Record<string, string> = {
  healthy: "bg-ok",
  unhealthy: "bg-bad",
  stopped: "bg-muted",
  starting: "bg-info animate-[dcpulse_1s_infinite]",
  stopping: "bg-info animate-[dcpulse_1s_infinite]",
  restarting: "bg-info animate-[dcpulse_1s_infinite]",
};

const LINK_CLASS = (active: boolean) =>
  cn(
    "flex min-h-[42px] w-full items-center gap-3 rounded-[9px] px-3 text-sm",
    active ? "bg-brand-soft font-semibold text-brand-text" : "font-medium text-muted2",
  );

export function Sidebar({ unhealthyCount = 0 }: { unhealthyCount?: number }) {
  const pathname = usePathname();
  const { data: services } = useServices();
  // The registry query is invalidated by every add/edit/delete/reorder, so changes show instantly.
  const { data: registry = [] } = useRegistryServices();
  const statusById = new Map((services ?? []).map((service) => [service.id, service.status]));
  const attention = services
    ? services.filter((service) => service.status === "unhealthy" || service.status === "stopped")
        .length
    : unhealthyCount;

  return (
    <aside className="flex flex-[1_1_220px] flex-col gap-6 border-r border-border bg-sidebar px-3.5 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-brand text-brand-foreground">
          <Layers className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold tracking-[-0.01em] text-foreground">
            StackPilot
          </span>
          <span className="text-xs text-muted-foreground">Custom DevOps stack</span>
        </div>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {TOP_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          const showBadge = href === "/services" && attention > 0;

          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={LINK_CLASS(active)}>
              <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span className="flex-1 text-left text-muted-foreground">{label}</span>
              {showBadge && (
                <span className="rounded-full bg-bad-bg px-[7px] py-[2px] text-[11px] font-bold text-bad">
                  {attention}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Services" className="flex min-h-0 flex-col gap-0.5">
        <span className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Services
        </span>
        {registry.length === 0 && (
          <span className="px-3 py-2 text-xs text-muted-foreground">No services yet</span>
        )}
        {registry.map((service) => {
          const href = `/services/${encodeURIComponent(service.id)}`;
          const active = pathname === href;
          const Icon = resolveServiceIcon(service.icon, service.id);
          const status = statusById.get(service.id);

          return (
            <Link key={service.id} href={href} aria-current={active ? "page" : undefined} className={LINK_CLASS(active)}>
              <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">{service.name}</span>
              <span
                role="img"
                aria-label={`Status: ${status ?? "unknown"}`}
                title={status ?? "unknown"}
                className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status ?? ""] ?? "bg-muted")}
              />
            </Link>
          );
        })}
      </nav>

      <nav aria-label="App" className="flex flex-col gap-0.5">
        {BOTTOM_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={LINK_CLASS(active)}>
              <Icon className="size-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span className="flex-1 text-left text-muted-foreground">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 rounded-[12px] border border-border bg-card2 p-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Stack root
        </span>
        <code className="break-all font-mono text-xs text-fg2">
          ~/Other/02-DevOps-Lab/custom-devops-stack
        </code>
        <div className="flex items-center gap-2 text-xs text-muted2">
          <span className="size-[7px] rounded-full bg-ok" />
          Docker Desktop running
        </div>
      </div>
    </aside>
  );
}
