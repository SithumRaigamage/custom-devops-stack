import { z } from "zod";
import { INTEGRATION_KINDS, type IntegrationKind } from "./service-model.js";

// Validation for service create/edit payloads. Kept free of database imports so
// the rules can be unit tested without PostgreSQL.

export const COMMAND_PATTERN = /^[a-zA-Z0-9_./:@%+=,-]+(?:\s+[a-zA-Z0-9_./:@%+=,-]+)*$/;
export const MAX_COMMAND_LENGTH = 2000;
const command = z.string().trim().max(MAX_COMMAND_LENGTH).optional();
const COMMAND_FIELDS = ["startCmd", "stopCmd", "restartCmd", "logsCmd", "startCommand", "stopCommand"] as const;

export const ServiceInputSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1).max(80),
  desc: z.string().trim().max(200).optional(),
  description: z.string().trim().max(200).optional(),
  folder: z.string().trim().min(1).max(1024),
  type: z.enum(["compose", "custom"]).default("compose"),
  composeFile: z.string().trim().min(1).max(128).default("docker-compose.yml"),
  port: z.number().int().min(1).max(65535),
  url: z.string().trim().url(),
  healthUrl: z.string().trim().url().optional(),
  healthPath: z.string().trim().regex(/^\//).max(512).optional(),
  icon: z.string().trim().max(64).optional(),
  startCmd: command,
  stopCmd: command,
  restartCmd: command,
  logsCmd: command,
  startCommand: command,
  stopCommand: command,
  runInShell: z.boolean().default(false),
  integration: z.enum(INTEGRATION_KINDS as [IntegrationKind, ...IntegrationKind[]]).default("none"),
  integrationUrl: z.string().trim().url().optional(),
  integrationUser: z.string().trim().max(200).optional(),
  integrationHeader: z.string().trim().regex(/^[A-Za-z0-9-]+$/, "Header name may only contain letters, digits and dashes").max(100).optional(),
  /** Write-only. API token, or header value for generic_http. Never returned. */
  integrationSecret: z.string().max(4096).optional(),
  /** Remove the saved credential. */
  removeCredential: z.boolean().optional(),
}).strict().superRefine((data, ctx) => {
  for (const field of COMMAND_FIELDS) {
    const value = data[field];
    if (!value) continue;
    if (data.runInShell) {
      if (value.includes("\0")) ctx.addIssue({ code: "custom", path: [field], message: "Command contains a NUL byte" });
    } else if (!COMMAND_PATTERN.test(value)) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "Command contains characters that need a shell. Turn on \"Run in shell\" to use them.",
      });
    }
  }
  if (data.integration !== "none" && !data.integrationUrl) {
    ctx.addIssue({ code: "custom", path: ["integrationUrl"], message: "Base URL is required for this integration" });
  }
  if (data.integration === "jenkins" && !data.integrationUser) {
    ctx.addIssue({ code: "custom", path: ["integrationUser"], message: "Username is required for Jenkins" });
  }
});

export type ServiceInput = z.infer<typeof ServiceInputSchema>;
