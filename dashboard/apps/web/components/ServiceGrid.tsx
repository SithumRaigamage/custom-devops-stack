import type { Service } from "@/lib/api";
import { ServiceCard } from "./ServiceCard";

export function ServiceGrid({
  services,
  total,
  query,
  onViewLogs,
}: {
  /** Already filtered by the top-bar search. */
  services: Service[];
  total: number;
  query: string;
  onViewLogs: (service: Service) => void;
}) {
  return (
    <section aria-label="Services" className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold text-foreground">Services</h2>
        <span className="text-xs text-muted-foreground">
          {services.length} of {total} shown
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} onViewLogs={onViewLogs} />
        ))}
      </div>

      {services.length === 0 && (
        <div className="rounded-[14px] border border-dashed border-border2 p-7 text-center text-muted-foreground">
          No services match “{query}”.
        </div>
      )}
    </section>
  );
}
