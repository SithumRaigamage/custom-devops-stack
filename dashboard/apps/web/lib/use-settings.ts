"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRegistryService,
  deleteRegistryService,
  fetchRegistryFolders,
  fetchRegistryServices,
  fetchSettings,
  saveSettings,
  updateRegistryService,
  type ServiceInput,
  type SettingsPatch,
} from "./api";

export const SETTINGS_QUERY_KEY = ["settings"] as const;
export const REGISTRY_SERVICES_QUERY_KEY = ["registry-services"] as const;
export const REGISTRY_FOLDERS_QUERY_KEY = ["registry-folders"] as const;

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: ({ signal }) => fetchSettings(signal),
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: SettingsPatch) => saveSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, data);
      // Stack root may have changed, so folders need re-listing.
      void queryClient.invalidateQueries({ queryKey: REGISTRY_FOLDERS_QUERY_KEY });
    },
  });
}

export function useRegistryServices() {
  return useQuery({
    queryKey: REGISTRY_SERVICES_QUERY_KEY,
    queryFn: ({ signal }) => fetchRegistryServices(signal),
  });
}

export function useRegistryFolders() {
  return useQuery({
    queryKey: REGISTRY_FOLDERS_QUERY_KEY,
    queryFn: ({ signal }) => fetchRegistryFolders(signal),
  });
}

function useInvalidateRegistry() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: REGISTRY_SERVICES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: REGISTRY_FOLDERS_QUERY_KEY });
    // The dashboard list is served from the same services.yaml.
    void queryClient.invalidateQueries({ queryKey: ["services"] });
  };
}

export function useCreateRegistryService() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: (input: ServiceInput) => createRegistryService(input),
    onSuccess: invalidate,
  });
}

export function useUpdateRegistryService() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServiceInput }) =>
      updateRegistryService(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteRegistryService() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: (id: string) => deleteRegistryService(id),
    onSuccess: invalidate,
  });
}
