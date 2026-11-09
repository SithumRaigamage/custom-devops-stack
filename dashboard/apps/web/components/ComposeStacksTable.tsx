import type { Service } from "@/lib/api";
import { imageFor } from "@/lib/mock";
import { StatusBadge } from "./StatusBadge";

function folderName(folder: string): string {
  return `${folder.split("/").filter(Boolean).pop() ?? folder}/`;
}

function healthCheck(health: string): string {
  try {
    return `GET ${new URL(health).pathname}`;
  } catch {
    return health;
  }
}

export function ComposeStacksTable({ services }: { services: Service[] }) {
  return (
    <section
      aria-label="Compose stacks"
      className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5"
    >
      <h2 className="m-0 text-base font-semibold text-foreground">Compose stacks</h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              {["Service", "Folder", "Image", "Health check", "Status"].map((heading) => (
                <th
                  key={heading}
                  className="border-b border-border px-3 py-2.5 font-medium"
                  scope="col"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td className="border-b border-track px-3 py-3 font-semibold text-foreground">
                  {service.name}
                </td>
                <td className="border-b border-track px-3 py-3 font-mono text-xs text-fg2">
                  {folderName(service.folder)}
                </td>
                <td className="border-b border-track px-3 py-3 font-mono text-xs text-fg2">
                  {imageFor(service.id)}
                </td>
                <td className="border-b border-track px-3 py-3 font-mono text-xs text-fg2">
                  {healthCheck(service.health)}
                </td>
                <td className="border-b border-track px-3 py-3">
                  <StatusBadge status={service.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
