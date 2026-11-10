"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EVENTS_URL, type Service } from "./api";
import { ACTIVITY_QUERY_KEY } from "./use-activity";
import { POLL_INTERVAL_MS, SERVICES_QUERY_KEY } from "./use-services";

interface StatsEvent {
  ts: number;
  services?: Service[];
}

/**
 * One EventSource per dashboard session. It writes service/stats events straight
 * into the TanStack Query cache; if the stream drops it falls back to polling.
 */
export function useEvents() {
  const queryClient = useQueryClient();
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const mergeService = (detail: Partial<Service> & { id: string }) => {
      queryClient.setQueryData<Service[]>(SERVICES_QUERY_KEY, (services) =>
        services?.map((service) =>
          service.id === detail.id ? { ...service, ...detail } : service,
        ),
      );
    };

    const refreshAll = () => {
      void queryClient.invalidateQueries({ queryKey: SERVICES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(refreshAll, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    };

    const source$ = new EventSource(EVENTS_URL);
    source = source$;


    source$.onopen = () => {
      setReconnecting(false);
      stopPolling();
      // Catch up on anything that changed while the stream was down.
      refreshAll();
    };

    source$.onerror = () => {
      setReconnecting(true);
      startPolling();
    };

    source$.addEventListener("service.updated", (event) => {
      try {
        mergeService(JSON.parse((event as MessageEvent).data) as Partial<Service> & { id: string });
      } catch {
        // Ignore malformed frames; the next poll/event corrects the cache.
      }
    });

    source$.addEventListener("stats", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as StatsEvent;
        if (Array.isArray(data.services)) {
          queryClient.setQueryData<Service[]>(SERVICES_QUERY_KEY, data.services);
        }
      } catch {
        // Ignore malformed frames.
      }
    });

    source$.addEventListener("activity.created", () => {
      void queryClient.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
    });

    return () => {
      source?.close();
      stopPolling();
    };
  }, [queryClient]);

  return { reconnecting };
}
