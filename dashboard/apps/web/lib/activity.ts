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

export function activityDot(kind: string, outcome?: "ok" | "failed"): string {
  if (outcome === "failed") return "bg-bad";
  if (kind === "service.delete" || kind === "credential.remove") return "bg-warn";
  return DOT[kind] ?? "bg-info";
}

/** Plain-language label for an activity kind, for filters and badges. */
const KIND_LABEL: Record<string, string> = {
  start: "Service started",
  stop: "Service stopped",
  restart: "Service restarted",
  fail: "Action failed",
  healthy: "Became healthy",
  unhealthy: "Became unhealthy",
  status: "Status change",
  build: "Jenkins build",
  "ollama.load": "Model loaded",
  "ollama.unload": "Model unloaded",
  "settings.update": "Settings changed",
  "alerts.read": "Alerts read",
  "notifications.test": "Test notification",
  "service.create": "Service added",
  "service.update": "Service edited",
  "service.delete": "Service removed",
  "service.reorder": "Services reordered",
  "credential.remove": "Credential removed",
  "command.test": "Command test run",
  "backup.create": "Image backup",
  "backup.restore": "Image restore",
  "docker.prune": "Docker prune",
  "auth.setup": "Account created",
  "auth.login": "Sign-in",
  "auth.logout": "Sign-out",
  "auth.password": "Password changed",
};

export function activityKindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
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
