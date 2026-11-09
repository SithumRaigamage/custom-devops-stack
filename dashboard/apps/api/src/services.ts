import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export interface Service {
  id: string;
  name: string;
  folder: string;
  composeFile: string;
  url: string;
  health: string;
}

const FIELDS: (keyof Service)[] = ["id", "name", "folder", "composeFile", "url", "health"];

// services.yaml lives at the dashboard root; override with SERVICES_FILE.
const defaultPath = fileURLToPath(new URL("../../../services.yaml", import.meta.url));

export function loadServices(path = process.env.SERVICES_FILE ?? defaultPath): Service[] {
  const doc = parse(readFileSync(path, "utf8")) as { services?: unknown };
  if (!doc || !Array.isArray(doc.services)) {
    throw new Error(`${path}: expected a top-level "services" list`);
  }
  return doc.services.map((entry, i) => {
    for (const field of FIELDS) {
      if (typeof entry?.[field] !== "string" || entry[field] === "") {
        throw new Error(`${path}: services[${i}] is missing string field "${field}"`);
      }
    }
    return entry as Service;
  });
}
