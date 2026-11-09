"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Moon, Play, Search, Square, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-provider";
import { useTheme } from "./theme-provider";
import { ThemePicker } from "./ThemePicker";

export type ActivityKind = "start" | "stop" | "build" | "warn" | "fail";

export interface TopBarActivity {
  kind: ActivityKind;
  text: string;
  time: string;
}

const ACTIVITY_DOT: Record<ActivityKind, string> = {
  start: "bg-ok",
  stop: "bg-bad",
  build: "bg-info",
  warn: "bg-warn",
  fail: "bg-bad",
};

interface TopBarProps {
  /** Last activities, newest first. The first four are shown in the bell popover. */
  notifications?: TopBarActivity[];
  onStartAll?: () => void;
  onStopAll?: () => void;
}

export function TopBar({ notifications = [], onStartAll, onStopAll }: TopBarProps) {
  const { dark, toggleMode } = useTheme();
  const { query, setQuery } = useSearch();
  // The preview starts with three unread activities.
  const [unread, setUnread] = useState(Math.min(3, notifications.length));
  const [open, setOpen] = useState<"theme" | "notifications" | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open !== "notifications") return;

    const onPointerDown = (event: PointerEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleNotifications() {
    if (open === "notifications") {
      setOpen(null);
      return;
    }
    setUnread(0);
    setOpen("notifications");
  }

  const modeLabel = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-7 py-3.5">
      <label className="flex h-[42px] flex-[1_1_260px] items-center gap-2.5 rounded-[10px] border border-border2 bg-card2 px-3.5 text-muted-foreground">
        <Search className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="sr-only">Search services</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search services, builds, logs…"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded-[5px] border border-border2 px-1.5 py-px font-mono text-[11px] text-muted-foreground">
          ⌘K
        </kbd>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onStartAll}
          className="inline-flex h-[42px] items-center gap-2 rounded-[10px] border border-brand bg-brand px-4 text-[13px] font-bold text-brand-foreground"
        >
          <Play className="size-[14px]" fill="currentColor" stroke="none" aria-hidden="true" />
          Start All
        </button>
        <button
          type="button"
          onClick={onStopAll}
          className="inline-flex h-[42px] items-center gap-2 rounded-[10px] border border-border2 bg-card2 px-4 text-[13px] font-semibold text-foreground"
        >
          <Square className="size-[13px]" fill="currentColor" stroke="none" aria-hidden="true" />
          Stop All
        </button>

        <ThemePicker
          open={open === "theme"}
          onOpenChange={(next) => setOpen(next ? "theme" : null)}
        />

        <button
          type="button"
          onClick={toggleMode}
          aria-label={modeLabel}
          title={modeLabel}
          className="inline-flex h-[42px] w-[44px] items-center justify-center rounded-[10px] border border-border2 bg-card2 text-fg2"
        >
          {dark ? (
            <Sun className="size-[18px]" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Moon className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
          )}
        </button>

        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={toggleNotifications}
            aria-label="Notifications"
            aria-expanded={open === "notifications"}
            className="relative inline-flex h-[42px] w-[44px] items-center justify-center rounded-[10px] border border-border2 bg-card2 text-fg2"
          >
            <Bell className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
            {unread > 0 && (
              <span className="absolute right-[7px] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-brand-foreground">
                {unread}
              </span>
            )}
          </button>

          {open === "notifications" && (
            <div className="absolute right-0 top-[50px] z-30 w-[320px] max-w-[86vw] rounded-[12px] border border-border2 bg-card2 p-2 shadow-[var(--shadow-popover-strong)] max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:w-auto max-sm:max-w-none">
              <div className="px-2.5 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Notifications
              </div>
              {notifications.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">No activity yet.</p>
              ) : (
                notifications.slice(0, 4).map((item, i) => (
                  <div key={`${item.text}-${i}`} className="flex gap-2.5 rounded-lg p-2.5">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        ACTIVITY_DOT[item.kind],
                      )}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[13px] text-foreground">{item.text}</span>
                      <span className="text-xs text-muted-foreground">{item.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div
          role="img"
          aria-label="Sithum Raigamage"
          className="flex size-[42px] items-center justify-center rounded-full border border-brand-border bg-brand-soft text-[13px] font-bold text-brand-text"
        >
          SR
        </div>
      </div>
    </header>
  );
}
