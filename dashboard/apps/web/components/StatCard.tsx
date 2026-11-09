import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  suffix,
  note,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  suffix?: string;
  note: string;
  /** Text colour for the value, e.g. text-ok or text-warn. */
  tone?: string;
}) {
  // Counts are large numbers; words such as "Failed" or "Passed" use the smaller size.
  const isCount = /^\d+$/.test(value);

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card p-[18px]">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-bold tracking-[-0.02em]",
            isCount ? "text-[30px]" : "text-[26px]",
            tone,
          )}
        >
          {value}
        </span>
        {suffix && <span className="text-[13px] text-muted-foreground">{suffix}</span>}
      </div>
      <span className="text-xs text-muted2">{note}</span>
    </div>
  );
}
