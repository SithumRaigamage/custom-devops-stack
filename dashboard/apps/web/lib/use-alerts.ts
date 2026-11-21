"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAlerts, markAlertRead, markAllAlertsRead } from "./api";

export const ALERTS_QUERY_KEY = ["alerts"] as const;

export function useAlerts() {
  return useQuery({
    queryKey: ALERTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchAlerts(signal),
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => markAlertRead(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markAllAlertsRead(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY }),
  });
}
