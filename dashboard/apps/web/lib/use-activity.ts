"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  fetchActivity,
  fetchActivityFacets,
  fetchActivityPage,
  type ActivityFilter,
} from "./api";

export const ACTIVITY_QUERY_KEY = ["activity"] as const;

/** Recent activity rows, newest first. Refreshed by the /api/events stream. */
export function useActivity(limit = 50) {
  return useQuery({
    queryKey: [...ACTIVITY_QUERY_KEY, limit],
    queryFn: ({ signal }) => fetchActivity(limit, signal),
  });
}

/** Filtered audit log with "Load more" paging. Shares the activity key so SSE refreshes it. */
export function useActivityLog(filter: ActivityFilter, pageSize = 50) {
  return useInfiniteQuery({
    queryKey: [...ACTIVITY_QUERY_KEY, "log", filter, pageSize],
    queryFn: ({ pageParam, signal }) =>
      fetchActivityPage(filter, { limit: pageSize, before: pageParam ?? undefined }, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useActivityFacets() {
  return useQuery({
    queryKey: [...ACTIVITY_QUERY_KEY, "facets"],
    queryFn: ({ signal }) => fetchActivityFacets(signal),
    staleTime: 30_000,
  });
}
