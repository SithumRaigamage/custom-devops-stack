import {
  Box,
  Cpu,
  Database,
  GitBranch,
  Globe,
  MessageSquare,
  Server,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/** Icon names a service can store (see the Settings form). */
export const SERVICE_ICON_OPTIONS = [
  { value: "server", label: "Server" },
  { value: "git-branch", label: "Git branch" },
  { value: "shield-check", label: "Shield" },
  { value: "message-square", label: "Chat" },
  { value: "database", label: "Database" },
  { value: "globe", label: "Globe" },
  { value: "box", label: "Box" },
  { value: "cpu", label: "CPU" },
] as const;

const ICON_BY_NAME: Record<string, LucideIcon> = {
  "git-branch": GitBranch,
  "shield-check": ShieldCheck,
  "message-square": MessageSquare,
  database: Database,
  globe: Globe,
  box: Box,
  server: Server,
  cpu: Cpu,
};

const ICON_BY_ID: Record<string, LucideIcon> = {
  jenkins: GitBranch,
  sonarqube: ShieldCheck,
  "open-webui": MessageSquare,
};

export function resolveServiceIcon(icon?: string, id?: string): LucideIcon {
  return (icon ? ICON_BY_NAME[icon] : undefined) ?? (id ? ICON_BY_ID[id] : undefined) ?? Server;
}
