"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, KeyRound, LogOut, Moon, Play, Search, Square, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { changePassword, fetchAuthStatus, logout } from "@/lib/api";
import { useSearch } from "./search-provider";
import { useTheme } from "./theme-provider";
import { ThemePicker } from "./ThemePicker";
import { Spinner } from "@/app/Spinner";

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

const MIN_PASSWORD = 12;

/** Two initials from the real username, e.g. "sithum raigamage" -> "SR". */
function initialsOf(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface TopBarProps {
  /** Last activities, newest first. The first four are shown in the bell popover. */
  notifications?: TopBarActivity[];
  onStartAll?: () => void;
  onStopAll?: () => void;
}

export function TopBar({ notifications = [], onStartAll, onStopAll }: TopBarProps) {
  const { dark, toggleMode } = useTheme();
  const { query, setQuery } = useSearch();
  const router = useRouter();

  // The preview starts with three unread activities.
  const [unread, setUnread] = useState(Math.min(3, notifications.length));
  const [open, setOpen] = useState<"theme" | "notifications" | "user" | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Real username from the session.
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAuthStatus()
      .then((status) => {
        if (!cancelled) setUsername(status.username);
      })
      .catch(() => {
        // The gate already handles redirects; leave the initials placeholder.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (open === null) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (notificationsRef.current?.contains(target)) return;
      if (userRef.current?.contains(target)) return;
      setOpen(null);
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

  // ---- Change password dialog ----
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogDone, setDialogDone] = useState(false);

  function openDialog() {
    setOpen(null);
    setCurrentPassword("");
    setNewPassword("");
    setDialogError(null);
    setDialogDone(false);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (dialogPending) return;
    setDialogOpen(false);
  }

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, dialogPending]);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogError(null);

    if (newPassword.length < MIN_PASSWORD) {
      setDialogError(`New password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setDialogPending(true);
    try {
      await changePassword(currentPassword, newPassword);
      setDialogDone(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setDialogPending(false);
    }
  }

  async function handleLogout() {
    setOpen(null);
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  const modeLabel = dark ? "Switch to light mode" : "Switch to dark mode";
  const initials = username ? initialsOf(username) : "··";

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
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", ACTIVITY_DOT[item.kind])}
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

        <div ref={userRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === "user" ? null : "user")}
            aria-label={`Account menu${username ? ` for ${username}` : ""}`}
            aria-haspopup="menu"
            aria-expanded={open === "user"}
            className="flex size-[42px] items-center justify-center rounded-full border border-brand-border bg-brand-soft text-[13px] font-bold text-brand-text"
          >
            {initials}
          </button>

          {open === "user" && (
            <div
              role="menu"
              className="absolute right-0 top-[50px] z-30 w-[240px] rounded-[12px] border border-border2 bg-card2 p-1.5 shadow-[var(--shadow-popover-strong)] max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:w-auto"
            >
              <div className="border-b border-border px-2.5 py-2">
                <p className="truncate text-[13px] font-semibold text-foreground">
                  {username ?? "Signed in"}
                </p>
                <p className="text-[11px] text-muted-foreground">Administrator</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={openDialog}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-brand-soft"
              >
                <KeyRound className="size-4 text-muted-foreground" strokeWidth={1.9} aria-hidden="true" />
                Change password
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground hover:bg-brand-soft"
              >
                <LogOut className="size-4 text-muted-foreground" strokeWidth={1.9} aria-hidden="true" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-password-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div className="w-full max-w-[380px] rounded-[14px] border border-border bg-card p-6 shadow-[var(--shadow-popover-strong)]">
            <h2 id="change-password-title" className="text-[18px] font-semibold text-fg">
              Change password
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Other sessions stay signed in.
            </p>

            {dialogDone ? (
              <>
                <p className="mt-5 rounded-[10px] border border-ok-bg bg-ok-bg px-3 py-2 text-[13px] text-ok">
                  Password updated.
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="inline-flex h-[38px] items-center rounded-[10px] border border-brand bg-brand px-4 text-[13px] font-bold text-brand-foreground"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={submitPassword} className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="current-password"
                    className="text-[13px] font-medium text-muted-foreground"
                  >
                    Current password
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                    className="h-[42px] w-full rounded-[10px] border border-border2 bg-field px-3 text-sm text-fg outline-none focus:border-brand-border"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="new-password"
                    className="text-[13px] font-medium text-muted-foreground"
                  >
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    minLength={MIN_PASSWORD}
                    className="h-[42px] w-full rounded-[10px] border border-border2 bg-field px-3 text-sm text-fg outline-none focus:border-brand-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    At least {MIN_PASSWORD} characters.
                  </p>
                </div>

                {dialogError && (
                  <p
                    role="alert"
                    className="rounded-[10px] border border-bad-bg bg-bad-bg px-3 py-2 text-[13px] text-bad"
                  >
                    {dialogError}
                  </p>
                )}

                <div className="mt-1 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={dialogPending}
                    className="inline-flex h-[38px] items-center rounded-[10px] border border-border2 bg-card2 px-4 text-[13px] font-semibold text-foreground disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={dialogPending}
                    className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-brand bg-brand px-4 text-[13px] font-bold text-brand-foreground disabled:opacity-60"
                  >
                    {dialogPending ? <Spinner /> : null}
                    Update password
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
