import { cn } from "@/lib/utils";

export type UiStatus =
  | "healthy"
  | "unhealthy"
  | "stopped"
  | "starting"
  | "stopping"
  | "restarting";

const STATUS: Record<UiStatus, { label: string; text: string; bg: string; pulse: boolean }> = {
  healthy: { label: "Healthy", text: "text-ok", bg: "bg-ok-bg", pulse: false },
  unhealthy: { label: "Unhealthy", text: "text-warn", bg: "bg-warn-bg", pulse: false },
  stopped: { label: "Stopped", text: "text-bad", bg: "bg-bad-bg", pulse: false },
  starting: { label: "Starting…", text: "text-info", bg: "bg-info-bg", pulse: true },
  stopping: { label: "Stopping…", text: "text-info", bg: "bg-info-bg", pulse: true },
  restarting: { label: "Restarting…", text: "text-info", bg: "bg-info-bg", pulse: true },
};

export function StatusBadge({ status }: { status: UiStatus }) {
  const meta = STATUS[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        meta.bg,
        meta.text,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          meta.pulse && "animate-[dcpulse_1s_infinite]",
        )}
      />
      {meta.label}
    </span>
  );
}
