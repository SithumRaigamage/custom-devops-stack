"use client";

import { ActivityTimeline } from "@/components/ActivityTimeline";
import { PageHeader } from "@/components/PageHeader";
import { ResourceChart } from "@/components/ResourceChart";
import { ServiceCard } from "@/components/ServiceCard";
import { StatCard } from "@/components/StatCard";
import { useSearch } from "@/components/search-provider";
import { LAST_BUILD, QUALITY_GATE, metricsFor } from "@/lib/mock";
import { useServices } from "@/lib/use-services";

const LAST_BUILD_LABEL =
  LAST_BUILD.status.charAt(0).toUpperCase() + LAST_BUILD.status.slice(1);
const LAST_BUILD_TONE =
  LAST_BUILD.status === "success"
    ? "text-ok"
    : LAST_BUILD.status === "failed"
      ? "text-bad"
      : "text-warn";

export default function OverviewPage() {
  const { data: services, isPending, error } = useServices();
  const { query } = useSearch();

  const list = services ?? [];
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? list.filter((service) =>
        `${service.name} ${metricsFor(service.id).description}`
          .toLowerCase()
          .includes(normalized),
      )
    : list;

  const total = list.length;
  const running = list.filter(
    (service) => service.status === "healthy" || service.status === "unhealthy",
  ).length;
  const healthy = list.filter((service) => service.status === "healthy").length;

  return (
    <>
      <PageHeader title="Overview" sub="Everything running in your custom DevOps stack." />

      {error ? (
        <div className="rounded-[12px] border border-bad-bg bg-bad-bg px-4 py-3 text-sm text-bad">
          Can&apos;t reach the API: {error.message}
        </div>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading services…</p>
      ) : (
        <>
          <section
            aria-label="Summary"
            className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4"
          >
            <StatCard
              label="Services running"
              value={String(running)}
              suffix={`/ ${total}`}
              note={running === total ? "All containers up" : `${total - running} stopped`}
            />
            <StatCard
              label="Healthy"
              value={String(healthy)}
              suffix={`/ ${total}`}
              note={
                healthy === total ? "Every health check passing" : `${total - healthy} need attention`
              }
              tone={healthy === total ? "text-ok" : "text-warn"}
            />
            <StatCard
              label="Last build"
              value={LAST_BUILD_LABEL}
              suffix={`#${LAST_BUILD.number}`}
              note={`${LAST_BUILD.job} · ${LAST_BUILD.when}`}
              tone={LAST_BUILD_TONE}
            />
            <StatCard
              label="Quality gate"
              value={QUALITY_GATE.gate}
              suffix={QUALITY_GATE.project}
              note={`${QUALITY_GATE.coverage}% coverage · ${QUALITY_GATE.bugs} bugs`}
              tone={QUALITY_GATE.gate === "Passed" ? "text-ok" : "text-bad"}
            />
          </section>

          <section aria-label="Services" className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-base font-semibold text-foreground">Services</h2>
              <span className="text-xs text-muted-foreground">
                {filtered.length} of {total} shown
              </span>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
              {filtered.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="rounded-[14px] border border-dashed border-border2 p-7 text-center text-muted-foreground">
                No services match “{query}”.
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-4">
            <ResourceChart />
            <ActivityTimeline />
          </div>
        </>
      )}
    </>
  );
}
