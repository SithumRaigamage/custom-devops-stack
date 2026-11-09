import type { Service } from "./api";

/** The top-bar search matches a service's name or its description. */
export function filterServices(services: Service[], query: string): Service[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return services;
  return services.filter((service) =>
    `${service.name} ${service.desc}`.toLowerCase().includes(normalized),
  );
}
