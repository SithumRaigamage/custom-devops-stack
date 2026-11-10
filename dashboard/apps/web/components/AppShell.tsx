"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { runServiceAction } from "@/lib/api";
import { SERVICES_QUERY_KEY, useServices } from "@/lib/use-services";
import { useToast } from "./toast";
import { SearchProvider } from "./search-provider";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Sidebar + content column. The sidebar stacks above the content on narrow screens. */
export function AppShell({
  children,
  unhealthyCount,
}: {
  children: ReactNode;
  unhealthyCount?: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: services = [] } = useServices();
  const [bulkAction, setBulkAction] = useState<"start" | "stop" | null>(null);

  const runAll = useCallback(
    async (action: "start" | "stop") => {
      const targets = services.filter((service) =>
        action === "start" ? service.status === "stopped" : service.status !== "stopped",
      );

      if (targets.length === 0) {
        toast(action === "start" ? "All services are already running" : "All services are already stopped");
        return;
      }

      setBulkAction(action);
      try {
        const results = await Promise.allSettled(
          targets.map((service) => runServiceAction(service.id, action)),
        );
        await queryClient.invalidateQueries({ queryKey: SERVICES_QUERY_KEY });

        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed === 0) {
          toast(`${action === "start" ? "Started" : "Stopped"} ${targets.length} ${
            targets.length === 1 ? "service" : "services"
          }`);
        } else {
          toast(
            `${action === "start" ? "Started" : "Stopped"} ${targets.length - failed} of ${
              targets.length
            } services`,
            "error",
          );
        }
      } finally {
        setBulkAction(null);
      }
    },
    [queryClient, services, toast],
  );

  return (
    <div className="flex min-h-screen flex-wrap">
      <SearchProvider>
        <Sidebar unhealthyCount={unhealthyCount} />
        <div className="flex min-w-0 flex-[999_1_560px] flex-col">
          <TopBar
            bulkAction={bulkAction}
            onStartAll={() => void runAll("start")}
            onStopAll={() => void runAll("stop")}
          />
          <main className="flex w-full max-w-[1360px] flex-col gap-6 p-7">{children}</main>
        </div>
      </SearchProvider>
    </div>
  );
}
