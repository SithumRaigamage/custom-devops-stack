"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDockerBackup,
  fetchDockerBackups,
  fetchDockerDisk,
  fetchPrunePreview,
  restoreDockerBackup,
  runDockerPrune,
} from "./api";

export const DOCKER_DISK_QUERY_KEY = ["docker-disk"] as const;
export const DOCKER_BACKUPS_QUERY_KEY = ["docker-backups"] as const;
export const PRUNE_PREVIEW_QUERY_KEY = ["docker-prune-preview"] as const;

export function useDockerDisk() {
  return useQuery({
    queryKey: DOCKER_DISK_QUERY_KEY,
    queryFn: ({ signal }) => fetchDockerDisk(signal),
  });
}

export function useDockerBackups() {
  return useQuery({
    queryKey: DOCKER_BACKUPS_QUERY_KEY,
    queryFn: ({ signal }) => fetchDockerBackups(signal),
  });
}

export function usePrunePreview(enabled: boolean) {
  return useQuery({
    queryKey: PRUNE_PREVIEW_QUERY_KEY,
    queryFn: ({ signal }) => fetchPrunePreview(signal),
    enabled,
  });
}

function useInvalidateHousekeeping() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: DOCKER_DISK_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: DOCKER_BACKUPS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: PRUNE_PREVIEW_QUERY_KEY });
  };
}

export function useCreateDockerBackup() {
  const invalidate = useInvalidateHousekeeping();

  return useMutation({
    mutationFn: (serviceId: string) => createDockerBackup(serviceId),
    onSuccess: invalidate,
  });
}

export function useRestoreDockerBackup() {
  const invalidate = useInvalidateHousekeeping();

  return useMutation({
    mutationFn: ({ serviceId, name }: { serviceId: string; name: string }) =>
      restoreDockerBackup(serviceId, name),
    onSuccess: invalidate,
  });
}

export function useDockerPrune() {
  const invalidate = useInvalidateHousekeeping();

  return useMutation({
    mutationFn: () => runDockerPrune(),
    onSuccess: invalidate,
  });
}
