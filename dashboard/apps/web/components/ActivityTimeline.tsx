"use client";

import { activityDot, relativeTime } from "@/lib/activity";
import { useActivity } from "@/lib/use-activity";
import { cn } from "@/lib/utils";

export function ActivityTimeline() {
  const { data: activity = [], isPending } = useActivity(8);

  return (
    <section
      aria-label="Recent activity"
      className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5"
    >
      <h2 className="m-0 text-base font-semibold text-foreground">Recent activity</h2>

      {isPending ? (
        <p className="m-0 text-[13px] text-muted-foreground">Loading activity…</p>
      ) : activity.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">
          Nothing yet. Start, stop or restart a service and it will show up here.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {activity.map((item) => (
            <li key={item.id} className="flex gap-3">
              <div className="flex w-2.5 flex-col items-center">
                <span
                  className={cn(
                    "mt-1 size-2.5 shrink-0 rounded-full shadow-[0_0_0_3px_var(--card)]",
                    activityDot(item.kind, item.outcome),
                  )}
                />
                <span className="min-h-[22px] w-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-0.5 pb-3.5">
                <span className="text-[13px] text-foreground">{item.message}</span>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(item.ts)} · {item.actor}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
