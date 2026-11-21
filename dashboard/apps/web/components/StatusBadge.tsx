import { cn } from "@/lib/utils";

export type UiStatus =
  | "healthy"
  | "unhealthy"
  | "stopped"
  | "starting"
  | "stopping"
  | "restarting"
  | "success"
  | "failed"
  | "unstable"
  | "running"
  | "aborted";

const STATUS: Record<UiStatus, { label: string; text: string; bg: string; pulse: boolean }> = {
  healthy: { label: "Healthy", text: "text-ok", bg: "bg-ok-bg", pulse: false },
  unhealthy: { label: "Unhealthy", text: "text-warn", bg: "bg-warn-bg", pulse: false },
  stopped: { label: "Stopped", text: "text-bad", bg: "bg-bad-bg", pulse: false },
  starting: { label: "Starting…", text: "text-info", bg: "bg-info-bg", pulse: true },
  stopping: { label: "Stopping…", text: "text-info", bg: "bg-info-bg", pulse: true },
  restarting: { label: "Restarting…", text: "text-info", bg: "bg-info-bg", pulse: true },
  success: { label: "Success", text: "text-ok", bg: "bg-ok-bg", pulse: false },
  failed: { label: "Failed", text: "text-bad", bg: "bg-bad-bg", pulse: false },
  unstable: { label: "Unstable", text: "text-warn", bg: "bg-warn-bg", pulse: false },
  running: { label: "Running…", text: "text-info", bg: "bg-info-bg", pulse: true },
  aborted: { label: "Aborted", text: "text-muted2", bg: "bg-neutral-bg", pulse: false },
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
