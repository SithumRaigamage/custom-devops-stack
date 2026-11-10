"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Hammer,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  Palette as PaletteIcon,
  Play,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Square,
  Sun,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import {
  logout,
  runServiceAction,
  type Service,
  type ServiceAction,
} from "@/lib/api";
import { useIntegrationServiceId } from "@/lib/use-settings";
import { useJenkinsBuilds, useRebuildJob } from "@/lib/use-jenkins";
import { SERVICES_QUERY_KEY, useServices } from "@/lib/use-services";
import { cn } from "@/lib/utils";
import { LogsDrawer } from "./LogsDrawer";
import { useTheme } from "./theme-provider";
import { useToast } from "./toast";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

const RECENTS_KEY = "stackpilot-command-recents";
const MAX_RECENTS = 8;
const EMPTY_SERVICES: Service[] = [];

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/services", label: "Services", icon: Server },
  { href: "/assistant", label: "AI Assistant", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

type GroupName = "Pages" | "Services" | "Jenkins" | "Appearance" | "Session";
const GROUP_ORDER: GroupName[] = [
  "Pages",
  "Services",
  "Jenkins",
  "Appearance",
  "Session",
];

type PaletteAction =
  | { kind: "navigate"; href: string }
  | {
      kind: "service";
      serviceId: string;
      serviceName: string;
      verb: ServiceAction;
    }
  | { kind: "logs"; service: Service }
  | { kind: "rebuild"; job: string }
  | { kind: "theme"; name: string }
  | { kind: "mode" }
  | { kind: "stopAll" }
  | { kind: "logout" };

interface PaletteCommand {
  id: string;
  group: GroupName;
  label: string;
  keywords?: string;
  icon: LucideIcon;
  hint?: string;
  destructive?: boolean;
  action: PaletteAction;
}

type Confirm =
  | { kind: "stop"; serviceId: string; serviceName: string }
  | { kind: "stopAll"; names: string[] };

const PAST_TENSE: Record<ServiceAction, string> = {
  start: "Started",
  stop: "Stopped",
  restart: "Restarted",
};

function readRecents(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(RECENTS_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string")
          .slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The command failed";
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme, themes, dark, setTheme, toggleMode } = useTheme();
  const { data: services = EMPTY_SERVICES } = useServices();
  const jenkinsId = useIntegrationServiceId("jenkins");
  const { data: jenkins } = useJenkinsBuilds(jenkinsId, { enabled: open });
  const rebuild = useRebuildJob(jenkinsId);

  const serviceAction = useMutation({
    mutationFn: ({ serviceId, verb }: { serviceId: string; verb: ServiceAction }) =>
      runServiceAction(serviceId, verb),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: SERVICES_QUERY_KEY }),
  });

  const [recents, setRecents] = useState<string[]>([]);
  const [logsFor, setLogsFor] = useState<Service | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirming, setConfirming] = useState(false);

  // ⌘K / Ctrl+K works anywhere in the dashboard, including inside inputs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || confirm) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange, confirm]);

  useEffect(() => {
    if (open) setRecents(readRecents());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = NAV_ITEMS.map(({ href, label, icon }) => ({
      id: `page:${href}`,
      group: "Pages",
      label: `Go to ${label}`,
      keywords: `page navigate go ${label} ${href}`,
      icon,
      hint: href,
      action: { kind: "navigate", href },
    }));

    for (const service of services) {
      const base = `${service.id} ${service.name}`;
      list.push({
        id: `service:${service.id}:start`,
        group: "Services",
        label: `Start ${service.name}`,
        keywords: `${base} start`,
        icon: Play,
        action: {
          kind: "service",
          serviceId: service.id,
          serviceName: service.name,
          verb: "start",
        },
      });
      list.push({
        id: `service:${service.id}:stop`,
        group: "Services",
        label: `Stop ${service.name}`,
        keywords: `${base} stop`,
        icon: Square,
        destructive: true,
        hint: "confirm",
        action: {
          kind: "service",
          serviceId: service.id,
          serviceName: service.name,
          verb: "stop",
        },
      });
      list.push({
        id: `service:${service.id}:restart`,
        group: "Services",
        label: `Restart ${service.name}`,
        keywords: `${base} restart`,
        icon: RefreshCw,
        action: {
          kind: "service",
          serviceId: service.id,
          serviceName: service.name,
          verb: "restart",
        },
      });
      list.push({
        id: `service:${service.id}:logs`,
        group: "Services",
        label: `View logs for ${service.name}`,
        keywords: `${base} logs log view tail`,
        icon: Terminal,
        action: { kind: "logs", service },
      });
    }

    const running = services.filter((service) => service.status !== "stopped");
    if (running.length > 0) {
      list.push({
        id: "services:stop-all",
        group: "Services",
        label: "Stop all services",
        keywords: "stop all shutdown stack services",
        icon: Square,
        destructive: true,
        hint: "confirm",
        action: { kind: "stopAll" },
      });
    }

    const jobs = Array.from(
      new Set(jenkins?.builds.map((build) => build.job) ?? []),
    );
    for (const job of jobs) {
      list.push({
        id: `rebuild:${job}`,
        group: "Jenkins",
        label: `Rebuild ${job}`,
        keywords: `job build rebuild jenkins ${job}`,
        icon: Hammer,
        action: { kind: "rebuild", job },
      });
    }

    for (const item of themes) {
      list.push({
        id: `theme:${item.n}`,
        group: "Appearance",
        label: `Theme: ${item.n}`,
        keywords: `theme colour color appearance switch ${item.n}`,
        icon: PaletteIcon,
        hint: item.n === theme ? "Current" : undefined,
        action: { kind: "theme", name: item.n },
      });
    }

    list.push({
      id: "mode:toggle",
      group: "Appearance",
      label: dark ? "Switch to light mode" : "Switch to dark mode",
      keywords: "light dark mode appearance theme toggle",
      icon: dark ? Sun : Moon,
      action: { kind: "mode" },
    });

    list.push({
      id: "session:logout",
      group: "Session",
      label: "Log out",
      keywords: "sign out logout session account",
      icon: LogOut,
      action: { kind: "logout" },
    });

    return list;
  }, [services, jenkins, themes, theme, dark]);

  const recentIds = new Set(recents);
  const recentCommands = recents
    .map((id) => commands.find((command) => command.id === id))
    .filter((command): command is PaletteCommand => Boolean(command));
  const sections = GROUP_ORDER.map((group) => ({
    group,
    items: commands.filter(
      (command) => command.group === group && !recentIds.has(command.id),
    ),
  })).filter((section) => section.items.length > 0);

  async function performService(
    serviceId: string,
    serviceName: string,
    verb: ServiceAction,
  ) {
    try {
      await serviceAction.mutateAsync({ serviceId, verb });
      toast(`${PAST_TENSE[verb]} ${serviceName}`);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  function remember(id: string) {
    const next = [id, ...recents.filter((item) => item !== id)].slice(
      0,
      MAX_RECENTS,
    );
    setRecents(next);
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      // Private mode or a full quota: recents still work for this session.
    }
  }

  function run(command: PaletteCommand) {
    remember(command.id);
    onOpenChange(false);
    const action = command.action;

    switch (action.kind) {
      case "navigate":
        router.push(action.href);
        break;
      case "service":
        if (action.verb === "stop") {
          setConfirm({
            kind: "stop",
            serviceId: action.serviceId,
            serviceName: action.serviceName,
          });
        } else {
          void performService(
            action.serviceId,
            action.serviceName,
            action.verb,
          );
        }
        break;
      case "logs":
        setLogsFor(action.service);
        break;
      case "rebuild":
        void rebuild
          .mutateAsync(action.job)
          .then(() => toast(`Rebuild queued for ${action.job}`))
          .catch((error: unknown) => toast(errorMessage(error), "error"));
        break;
      case "theme":
        setTheme(action.name);
        break;
      case "mode":
        toggleMode();
        break;
      case "logout":
        void logout().finally(() => router.replace("/login"));
        break;
      case "stopAll":
        setConfirm({
          kind: "stopAll",
          names: services
            .filter((service) => service.status !== "stopped")
            .map((service) => service.name),
        });
        break;
    }
  }

  async function confirmStop(serviceId: string, serviceName: string) {
    setConfirming(true);
    await performService(serviceId, serviceName, "stop");
    setConfirming(false);
    setConfirm(null);
  }

  async function confirmStopAll() {
    setConfirming(true);
    const targets = services.filter((service) => service.status !== "stopped");

    if (targets.length === 0) {
      toast("All services are already stopped");
      setConfirming(false);
      setConfirm(null);
      return;
    }

    const results = await Promise.allSettled(
      targets.map((service) => runServiceAction(service.id, "stop")),
    );
    void queryClient.invalidateQueries({ queryKey: SERVICES_QUERY_KEY });

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length === 0) {
      toast(
        `Stopped ${targets.length} ${targets.length === 1 ? "service" : "services"}`,
      );
    } else {
      toast(
        `Stopped ${targets.length - failed.length} of ${targets.length} services`,
        "error",
      );
    }

    setConfirming(false);
    setConfirm(null);
  }

  function renderCommand(command: PaletteCommand) {
    const Icon = command.icon;
    return (
      <CommandItem
        key={command.id}
        value={`${command.label} ${command.keywords ?? ""}`}
        onSelect={() => run(command)}
      >
        <Icon
          className={cn(
            "size-4 shrink-0",
            command.destructive ? "text-bad" : "text-muted-foreground",
          )}
          strokeWidth={1.9}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{command.label}</span>
        {command.hint && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {command.hint}
          </span>
        )}
      </CommandItem>
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay px-4 pt-[12vh]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-[580px] overflow-hidden rounded-[14px] border border-border2 bg-card shadow-[var(--shadow-popover-strong)]"
          >
            <Command label="Command palette" loop>
              <CommandInput
                autoFocus
                placeholder="Type a command or search…"
                aria-label="Search commands"
              />
              <CommandList>
                <CommandEmpty>No matching commands.</CommandEmpty>

                {recentCommands.length > 0 && (
                  <CommandGroup heading="Recent">
                    {recentCommands.map(renderCommand)}
                  </CommandGroup>
                )}

                {sections.map((section) => (
                  <CommandGroup key={section.group} heading={section.group}>
                    {section.items.map(renderCommand)}
                  </CommandGroup>
                ))}
              </CommandList>

              <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                <span>
                  <kbd className="font-mono">↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className="font-mono">↵</kbd> select
                </span>
                <span>
                  <kbd className="font-mono">esc</kbd> close
                </span>
                <span className="ml-auto font-mono">⌘K</span>
              </div>
            </Command>
          </div>
        </div>
      )}

      {logsFor && (
        <LogsDrawer service={logsFor} onClose={() => setLogsFor(null)} />
      )}

      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="command-confirm-title"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay px-4"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !confirming) {
              setConfirm(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !confirming) setConfirm(null);
          }}
        >
          <div className="w-full max-w-[400px] rounded-[14px] border border-border bg-card p-6 shadow-[var(--shadow-popover-strong)]">
            <h2
              id="command-confirm-title"
              className="text-[18px] font-semibold text-fg"
            >
              {confirm.kind === "stopAll"
                ? "Stop all services?"
                : `Stop ${confirm.serviceName}?`}
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {confirm.kind === "stopAll"
                ? `This stops ${confirm.names.length} running ${
                    confirm.names.length === 1 ? "service" : "services"
                  }: ${confirm.names.join(", ")}.`
                : `${confirm.serviceName} stops accepting traffic until you start it again.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirm(null)}
                disabled={confirming}
                className="inline-flex h-[38px] items-center rounded-[10px] border border-border2 bg-card2 px-4 text-[13px] font-semibold text-foreground disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm.kind === "stopAll") void confirmStopAll();
                  else void confirmStop(confirm.serviceId, confirm.serviceName);
                }}
                disabled={confirming}
                className="inline-flex h-[38px] items-center rounded-[10px] border border-bad bg-bad-bg px-4 text-[13px] font-bold text-bad disabled:opacity-60"
              >
                {confirming ? "Stopping…" : "Stop"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
