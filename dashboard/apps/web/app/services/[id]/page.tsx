"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LogsDrawer } from "@/components/LogsDrawer";
import { PageHeader } from "@/components/PageHeader";
import { ServiceCard } from "@/components/ServiceCard";
import { JenkinsPanel } from "@/components/integrations/JenkinsPanel";
import { OllamaPanel } from "@/components/integrations/OllamaPanel";
import { SonarPanel } from "@/components/integrations/SonarPanel";
import { GenericHttpPanel } from "@/components/integrations/GenericHttpPanel";
import { useServices } from "@/lib/use-services";
import { useRegistryServices } from "@/lib/use-settings";

export default function ServiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { data: services, isPending, error } = useServices();
  const { data: registry, isPending: registryPending } = useRegistryServices();

  const entry = registry?.find((service) => service.id === id);
  const service = services?.find((item) => item.id === id);

  const back = (
    <Link href="/services" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground no-underline">
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      All services
    </Link>
  );

  if (registryPending) return <p className="text-sm text-muted-foreground">Loading service…</p>;

  if (!entry) {
    return (
      <>
        {back}
        <PageHeader title="Service not found" sub={`There is no service with id “${id}”. It may have been deleted.`} />
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeader title={entry.name} sub={entry.description || "Service details, logs and integration."} />

      {service ? (
        <div className="max-w-[560px]">
          <ServiceCard service={service} hideLogsButton />
        </div>
      ) : error ? (
        <div className="rounded-[12px] border border-bad-bg bg-bad-bg px-4 py-3 text-sm text-bad">
          {error.message.includes("docker_unavailable")
            ? "Docker isn’t running. Start Docker Desktop to see status and controls."
            : `Can’t reach the API: ${error.message}`}
        </div>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading status…</p>
      ) : null}

      {entry.integration !== "none" && (
        <section aria-label="Integration" className="flex flex-col gap-3">
          <h2 className="m-0 text-base font-semibold text-foreground">
            {{ jenkins: "Jenkins", sonarqube: "SonarQube", ollama: "Ollama", generic_http: "HTTP endpoint" }[entry.integration]}
          </h2>
          {entry.integration === "jenkins" && <JenkinsPanel serviceId={entry.id} />}
          {entry.integration === "sonarqube" && <SonarPanel serviceId={entry.id} />}
          {entry.integration === "ollama" && <OllamaPanel serviceId={entry.id} />}
          {entry.integration === "generic_http" && <GenericHttpPanel serviceId={entry.id} baseUrl={entry.integrationUrl} />}
        </section>
      )}

      {service && (
        <section aria-label="Logs" className="flex flex-col gap-3">
          <h2 className="m-0 text-base font-semibold text-foreground">Live logs</h2>
          <LogsDrawer service={service} inline />
        </section>
      )}
    </>
  );
}
