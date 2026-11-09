import { ACTIVITY, type ActivityKind } from "@/lib/mock";
import { cn } from "@/lib/utils";

const DOT: Record<ActivityKind, string> = {
  start: "bg-ok",
  stop: "bg-bad",
  build: "bg-info",
  warn: "bg-warn",
  fail: "bg-bad",
};

export function ActivityTimeline() {
  return (
    <section
      aria-label="Recent activity"
      className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5"
    >
      <h2 className="m-0 text-base font-semibold text-foreground">Recent activity</h2>
      <ol className="m-0 flex list-none flex-col p-0">
        {ACTIVITY.map((item, i) => (
          <li key={`${item.text}-${i}`} className="flex gap-3">
            <div className="flex w-2.5 flex-col items-center">
              <span
                className={cn(
                  "mt-1 size-2.5 shrink-0 rounded-full shadow-[0_0_0_3px_var(--card)]",
                  DOT[item.kind],
                )}
              />
              <span className="min-h-[22px] w-px flex-1 bg-border" />
            </div>
            <div className="flex flex-col gap-0.5 pb-3.5">
              <span className="text-[13px] text-foreground">{item.text}</span>
              <span className="text-xs text-muted-foreground">{item.time}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
