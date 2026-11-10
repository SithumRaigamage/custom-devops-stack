import type { ActivityKind } from "./api";

/** Tailwind background class for an activity dot. */
const DOT: Record<string, string> = {
  start: "bg-ok",
  healthy: "bg-ok",
  stop: "bg-bad",
  fail: "bg-bad",
  unhealthy: "bg-warn",
  warn: "bg-warn",
  restart: "bg-info",
  status: "bg-info",
  build: "bg-info",
};

export function activityDot(kind: string): string {
  return DOT[kind] ?? "bg-info";
}

export function isActivityKind(kind: string): kind is ActivityKind {
  return kind in DOT;
}

/** "just now", "12 min ago", "3 h ago", "Yesterday", "2 d ago". */
export function relativeTime(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} d ago`;
}
