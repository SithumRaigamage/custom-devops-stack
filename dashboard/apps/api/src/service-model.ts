// Shared service model. Deliberately free of database imports so pure unit
// tests can import the types and validators without PostgreSQL running.

export type ServiceType = "compose" | "custom";
export type IntegrationKind = "none" | "jenkins" | "sonarqube" | "ollama" | "generic_http";
export const INTEGRATION_KINDS: readonly IntegrationKind[] = ["none", "jenkins", "sonarqube", "ollama", "generic_http"];

export interface Service {
  id: string;
  name: string;
  desc?: string;
  image?: string;
  type: ServiceType;
  folder: string;
  workingDir: string;
  composeFile: string;
  url: string;
  health: string;
  port?: number;
  icon?: string;
  startCommand?: string;
  stopCommand?: string;
  restartCommand?: string;
  logsCommand?: string;
  runInShell: boolean;
  integration: IntegrationKind;
  sortOrder: number;
}
