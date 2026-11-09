"use client";

import { useState } from "react";
import { ComposeStacksTable } from "@/components/ComposeStacksTable";
import { LogsDrawer } from "@/components/LogsDrawer";
import { PageHeader } from "@/components/PageHeader";
import { ServiceGrid } from "@/components/ServiceGrid";
import { useSearch } from "@/components/search-provider";
import type { Service } from "@/lib/api";
import { filterServices } from "@/lib/filter-services";
import { useServices } from "@/lib/use-services";

export default function ServicesPage() {
  const { data: services, isPending, error } = useServices();
  const { query } = useSearch();
  const [logsFor, setLogsFor] = useState<Service | null>(null);

  const list = services ?? [];
  const filtered = filterServices(list, query);
  const logService = logsFor ? (list.find((s) => s.id === logsFor.id) ?? logsFor) : null;

  return (
    <>
      <PageHeader title="Services" sub="Start, stop and inspect each Docker Compose stack." />

      {error ? (
        <div className="rounded-[12px] border border-bad-bg bg-bad-bg px-4 py-3 text-sm text-bad">
          Can&apos;t reach the API: {error.message}
        </div>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading services…</p>
      ) : (
        <>
          <ServiceGrid
            services={filtered}
            total={list.length}
            query={query}
            onViewLogs={setLogsFor}
          />
          <ComposeStacksTable services={filtered} />
        </>
      )}

      {logService && <LogsDrawer service={logService} onClose={() => setLogsFor(null)} />}
    </>
  );
}
