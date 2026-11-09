"use client";

import { useState } from "react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { LogsDrawer } from "@/components/LogsDrawer";
import { PageHeader } from "@/components/PageHeader";
import { ResourceChart } from "@/components/ResourceChart";
import { ServiceGrid } from "@/components/ServiceGrid";
import { StatCard } from "@/components/StatCard";
import { useSearch } from "@/components/search-provider";
import type { Service } from "@/lib/api";
import { filterServices } from "@/lib/filter-services";
import { LAST_BUILD, QUALITY_GATE } from "@/lib/mock";
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
  const [logsFor, setLogsFor] = useState<Service | null>(null);

  const list = services ?? [];
  const filtered = filterServices(list, query);

  const total = list.length;
  const running = list.filter(
    (service) => service.status === "healthy" || service.status === "unhealthy",
  ).length;
  const healthy = list.filter((service) => service.status === "healthy").length;
  const logService = logsFor ? (list.find((s) => s.id === logsFor.id) ?? logsFor) : null;

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

          <ServiceGrid
            services={filtered}
            total={total}
            query={query}
            onViewLogs={setLogsFor}
          />

          <div className="flex flex-wrap gap-4">
            <ResourceChart />
            <ActivityTimeline />
          </div>
        </>
      )}

      {logService && <LogsDrawer service={logService} onClose={() => setLogsFor(null)} />}
    </>
  );
}
