import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

// ---------------------------------------------------------------------------
// Validation schema – every variable is required unless marked optional.
// ---------------------------------------------------------------------------

const Host = z.union([z.literal("127.0.0.1"), z.literal("localhost")]);

export const EnvSchema = z.object({
	// -----------------------------------------------------------------------
	// Core server
	// -----------------------------------------------------------------------
	PORT: z.string(),
	HOST: Host,

	// -----------------------------------------------------------------------
	// Stack root – where services.yaml lives (relative to the api dir)
	// -----------------------------------------------------------------------
	STACK_ROOT: z.string().default("."),

	// -----------------------------------------------------------------------
	// Persistence
	// -----------------------------------------------------------------------
	DATABASE_URL: z
		.string()
		.default("postgres://stackpilot:stackpilot@127.0.0.1:5432/stackpilot"),

	// -----------------------------------------------------------------------
	// Session
	// -----------------------------------------------------------------------
	SESSION_SECRET: z.string().min(32),

	// -----------------------------------------------------------------------
	// Downstream services – all optional; set only if you run that component
	// -----------------------------------------------------------------------
	OLLAMA_URL: z.string().url().optional(),
	JENKINS_URL: z.string().url().optional(),
	JENKINS_USER: z.string().optional(),
	JENKINS_API_TOKEN: z.string().optional(),
	SONAR_URL: z.string().url().optional(),
	SONAR_TOKEN: z.string().optional(),
}).refine(
	data => data.HOST === "127.0.0.1" || data.HOST === "localhost",
	{
		message: "HOST must be 127.0.0.1 or localhost",
		path: ["HOST"],
	},
);

// ---------------------------------------------------------------------------
// Parsed helpers with runtime defaults
// ---------------------------------------------------------------------------

export const PORT = Number(process.env.PORT) || 4000;
export const HOST = process.env.HOST;
export const STACK_ROOT = process.env.STACK_ROOT || ".";
export const DATABASE_URL =
	process.env.DATABASE_URL ?? "postgres://stackpilot:stackpilot@127.0.0.1:5432/stackpilot";

// ---------------------------------------------------------------------------
// Type-safe environment accessor
// ---------------------------------------------------------------------------

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);