import { homedir } from "node:os";
import { pool } from "./db.js";

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

let cachedServices: Service[] = [];

function displayFolder(folder: string): string {
  return folder === homedir() || folder.startsWith(`${homedir()}/`)
    ? `~${folder.slice(homedir().length)}`
    : folder;
}

export async function refreshServices(): Promise<Service[]> {
  const { rows } = await pool.query<{
    compose_id: string; name: string; description: string; icon: string | null;
    type: ServiceType; folder: string; working_dir: string | null; compose_file: string;
    port: number | null; url: string; health_url: string | null; start_cmd: string | null;
    stop_cmd: string | null; restart_cmd: string | null; logs_cmd: string | null;
    sort_order: number; run_in_shell: boolean; integration: IntegrationKind;
  }>(`SELECT compose_id,name,description,icon,type,folder,working_dir,compose_file,port,url,
             health_url,start_cmd,stop_cmd,restart_cmd,logs_cmd,sort_order,run_in_shell,integration
        FROM services ORDER BY sort_order, compose_id`);
  cachedServices = rows.map((row) => ({
    id: row.compose_id,
    name: row.name,
    desc: row.description,
    ...(row.icon ? { icon: row.icon } : {}),
    type: row.type,
    folder: displayFolder(row.folder),
    workingDir: row.working_dir ?? row.folder,
    composeFile: row.compose_file,
    url: row.url,
    health: row.health_url ?? row.url,
    ...(row.port ? { port: row.port } : {}),
    ...(row.start_cmd ? { startCommand: row.start_cmd } : {}),
    ...(row.stop_cmd ? { stopCommand: row.stop_cmd } : {}),
    ...(row.restart_cmd ? { restartCommand: row.restart_cmd } : {}),
    ...(row.logs_cmd ? { logsCommand: row.logs_cmd } : {}),
    runInShell: row.run_in_shell,
    integration: row.integration,
    sortOrder: row.sort_order,
  }));
  return cachedServices;
}

await refreshServices();

/** Database-backed snapshot. Registry mutations call refreshServices immediately. */
export function loadServices(): Service[] {
  return cachedServices;
}
