import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { AVERAGE_BUILD_DURATION, BUILDS } from "@/lib/mock";

const HEADINGS = ["Build", "Job", "Branch", "Status", "Duration", "Started"];

export default function JenkinsPage() {
  const done = BUILDS.filter((build) => build.status !== "running");
  const succeeded = done.filter((build) => build.status === "success").length;
  const successRate = Math.round((succeeded / Math.max(done.length, 1)) * 100);

  const summary = [
    { label: `Success rate (last ${done.length})`, value: `${successRate}%` },
    { label: "Average duration", value: AVERAGE_BUILD_DURATION },
    { label: "Running now", value: String(BUILDS.filter((b) => b.status === "running").length) },
    { label: "Failed today", value: String(BUILDS.filter((b) => b.status === "failed").length) },
  ];

  return (
    <>
      <PageHeader title="Jenkins" sub="Recent pipeline runs from your Jenkins server." />

      <section
        aria-label="Build summary"
        className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
      >
        {summary.map((card) => (
          <div
            key={card.label}
            className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-[18px]"
          >
            <span className="text-[13px] text-muted-foreground">{card.label}</span>
            <span className="text-[26px] font-bold tracking-[-0.02em] text-foreground">
              {card.value}
            </span>
          </div>
        ))}
      </section>

      <section
        aria-label="Recent builds"
        className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold text-foreground">Recent builds</h2>
          <a
            href="http://localhost:8080"
            target="_blank"
            rel="noopener"
            className="text-[13px] font-semibold text-brand-text no-underline"
          >
            Open Jenkins
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                {HEADINGS.map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b border-border px-3 py-2.5 font-medium"
                  >
                    {heading}
                  </th>
                ))}
                <th
                  scope="col"
                  aria-label="Actions"
                  className="border-b border-border px-3 py-2.5 font-medium"
                />
              </tr>
            </thead>
            <tbody>
              {BUILDS.map((build) => {
                const busy = build.status === "running";
                return (
                  <tr key={build.num}>
                    <td className="border-b border-track px-3 py-3 font-mono font-medium text-foreground">
                      #{build.num}
                    </td>
                    <td className="border-b border-track px-3 py-3 font-semibold text-foreground">
                      {build.job}
                    </td>
                    <td className="border-b border-track px-3 py-3 font-mono text-xs text-fg2">
                      {build.branch}
                    </td>
                    <td className="border-b border-track px-3 py-3">
                      <StatusBadge status={build.status} />
                    </td>
                    <td className="border-b border-track px-3 py-3 text-fg2">{build.duration}</td>
                    <td className="border-b border-track px-3 py-3 text-muted2">{build.when}</td>
                    <td className="border-b border-track px-3 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Rebuild ${build.job}`}
                        className="ml-auto inline-flex h-[38px] items-center gap-1.5 rounded-[8px] border border-border2 bg-card2 px-3 text-[13px] font-semibold text-fg2 disabled:cursor-not-allowed disabled:opacity-[0.38]"
                      >
                        <RefreshCw className="size-[13px]" strokeWidth={2.2} aria-hidden="true" />
                        Rebuild
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
