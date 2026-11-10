"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { LogsDrawer } from "@/components/LogsDrawer";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { relativeTime } from "@/lib/activity";
import type { JenkinsBuild } from "@/lib/api";
import {
  useJenkinsBuilds,
  useJenkinsSummary,
  useRebuildJob,
} from "@/lib/use-jenkins";

const HEADINGS = ["Build", "Job", "Branch", "Status", "Duration", "Started"];

function formatDuration(ms: number): string {
  if (!ms) return "—";
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

function ConnectJenkins({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <section className="flex max-w-[760px] flex-col gap-5 rounded-[14px] border border-border bg-card p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-base font-semibold text-foreground">Connect Jenkins</h2>
        <p className="m-0 text-[13px] text-muted-foreground">
          StackPilot reads builds and triggers jobs through the Jenkins REST API. It needs a
          URL, a user and an API token.
        </p>
      </div>

      <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-[13px] text-foreground">
        <li>
          In Jenkins, open your user menu → <strong>Configure</strong> →{" "}
          <strong>API Token</strong> → <strong>Add new token</strong>, then copy it.
        </li>
        <li>
          Add these to <code className="font-mono text-xs">apps/api/.env</code>:
          <pre className="mt-2 overflow-x-auto rounded-[10px] border border-border2 bg-card2 p-3 font-mono text-xs text-fg2">
{`JENKINS_URL=http://localhost:8080
JENKINS_USER=your-jenkins-user
JENKINS_API_TOKEN=your-api-token`}
          </pre>
        </li>
        <li>
          Restart the API (<code className="font-mono text-xs">pnpm --filter api dev</code>) and
          retry.
        </li>
      </ol>

      <div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-brand bg-brand px-4 text-[13px] font-bold text-brand-foreground disabled:opacity-60"
        >
          <RefreshCw
            className={retrying ? "size-[13px] animate-spin" : "size-[13px]"}
            strokeWidth={2.2}
            aria-hidden="true"
          />
          Retry connection
        </button>
      </div>
    </section>
  );
}

export default function JenkinsPage() {
  const buildsQuery = useJenkinsBuilds();
  const summaryQuery = useJenkinsSummary();
  const rebuild = useRebuildJob();
  const [consoleBuild, setConsoleBuild] = useState<JenkinsBuild | null>(null);

  const result = buildsQuery.data;
  const builds = result?.builds ?? [];
  const configured = result?.configured ?? summaryQuery.data?.configured ?? true;
  const summary = summaryQuery.data;

  const summaryCards = [
    {
      label: "Success rate (last 20)",
      value: summary ? `${summary.successRate}%` : "—",
    },
    {
      label: "Average duration",
      value: summary ? formatDuration(summary.averageDurationMs) : "—",
    },
    { label: "Running now", value: summary ? String(summary.running) : "—" },
    { label: "Failed today", value: summary ? String(summary.failedToday) : "—" },
  ];

  function retry() {
    void buildsQuery.refetch();
    void summaryQuery.refetch();
  }

  return (
    <>
      <PageHeader title="Jenkins" sub="Recent pipeline runs from your Jenkins server." />

      {buildsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Loading builds…</p>
      ) : buildsQuery.error ? (
        <div className="rounded-[12px] border border-bad-bg bg-bad-bg px-4 py-3 text-sm text-bad">
          Can’t reach Jenkins: {buildsQuery.error.message}
        </div>
      ) : !configured ? (
        <ConnectJenkins onRetry={retry} retrying={buildsQuery.isFetching} />
      ) : (
        <div className="flex flex-col gap-4">
          <section
            aria-label="Build summary"
            className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
          >
            {summaryCards.map((card) => (
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

          {rebuild.isError && (
            <div className="rounded-[12px] border border-bad-bg bg-bad-bg px-4 py-3 text-sm text-bad">
              Couldn’t trigger the build: {rebuild.error.message}
            </div>
          )}

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
                  {builds.length === 0 ? (
                    <tr>
                      <td
                        colSpan={HEADINGS.length + 1}
                        className="border-b border-track px-3 py-6 text-center text-muted-foreground"
                      >
                        No builds yet.
                      </td>
                    </tr>
                  ) : (
                    builds.map((build) => {
                      const rebuilding = rebuild.isPending && rebuild.variables === build.job;

                      return (
                        <tr
                          key={`${build.job}-${build.num}`}
                          tabIndex={0}
                          onClick={() => setConsoleBuild(build)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setConsoleBuild(build);
                            }
                          }}
                          aria-label={`Open console for ${build.job} #${build.num}`}
                          className="cursor-pointer hover:bg-card2 focus:outline-none focus-visible:bg-card2"
                        >
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
                          <td className="border-b border-track px-3 py-3 text-fg2">
                            {formatDuration(build.durationMs)}
                          </td>
                          <td className="border-b border-track px-3 py-3 text-muted2">
                            {relativeTime(build.startedAt)}
                          </td>
                          <td className="border-b border-track px-3 py-3 text-right">
                            <button
                              type="button"
                              disabled={build.status === "running" || rebuilding}
                              onClick={(event) => {
                                event.stopPropagation();
                                rebuild.mutate(build.job);
                              }}
                              aria-label={`Rebuild ${build.job}`}
                              className="ml-auto inline-flex h-[38px] items-center gap-1.5 rounded-[8px] border border-border2 bg-card2 px-3 text-[13px] font-semibold text-fg2 disabled:cursor-not-allowed disabled:opacity-[0.38]"
                            >
                              <RefreshCw
                                className={cnSpinner(rebuilding)}
                                strokeWidth={2.2}
                                aria-hidden="true"
                              />
                              Rebuild
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {consoleBuild && (
        <LogsDrawer
          console={{
            job: consoleBuild.job,
            num: consoleBuild.num,
            status: consoleBuild.status,
          }}
          onClose={() => setConsoleBuild(null)}
        />
      )}
    </>
  );
}

function cnSpinner(rebuilding: boolean): string {
  return rebuilding ? "size-[13px] animate-spin" : "size-[13px]";
}
