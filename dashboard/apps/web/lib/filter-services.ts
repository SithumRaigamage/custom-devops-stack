import type { Service } from "./api";
import { metricsFor } from "./mock";

/** The top-bar search matches a service's name or its description. */
export function filterServices(services: Service[], query: string): Service[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return services;
  return services.filter((service) =>
    `${service.name} ${metricsFor(service.id).description}`.toLowerCase().includes(normalized),
  );
}
