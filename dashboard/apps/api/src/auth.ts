import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, sessions, users } from "./db.js";

export const SESSION_COOKIE = "stackpilot_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SetupBody = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(12).max(256),
});

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const PasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(256),
});

export interface SessionUser {
  id: number;
  username: string;
}

function readCookie(req: FastifyRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  reply.header(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
  );
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.header(
    "set-cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request body";
}

/** Resolve the signed-in user from the session cookie, or null. */
export async function getSessionUser(req: FastifyRequest): Promise<SessionUser | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const rows = await db
    .select({ id: users.id, username: users.username, expiresAt: sessions.expires_at })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(eq(sessions.id, token));

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }

  return { id: row.id, username: row.username };
}

async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    id: token,
    user_id: userId,
    expires_at: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

async function countUsers(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Is there an admin yet? Is this browser signed in?
  app.get("/api/auth/status", async (req) => {
    const setupRequired = (await countUsers()) === 0;
    const user = setupRequired ? null : await getSessionUser(req);
    return {
      setupRequired,
      authenticated: user !== null,
      username: user?.username ?? null,
    };
  });

  // Create the single admin account. Only possible while no user exists.
  app.post("/api/auth/setup", async (req, reply) => {
    const body = SetupBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    if ((await countUsers()) > 0) {
      return reply.code(409).send({ error: "Setup has already been completed" });
    }

    const passwordHash = await argon2.hash(body.data.password);
    await db.insert(users).values({
      username: body.data.username,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    });

    return reply.code(201).send({ ok: true });
  });

  // Sign in. Five attempts per minute per client.
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = LoginBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

      const rows = await db
        .select({ id: users.id, passwordHash: users.password_hash })
        .from(users)
        .where(eq(users.username, body.data.username));

      const user = rows[0];
      if (!user) return reply.code(401).send({ error: "Invalid username or password" });

      const ok = await argon2.verify(user.passwordHash, body.data.password);
      if (!ok) return reply.code(401).send({ error: "Invalid username or password" });

      const token = await createSession(user.id);
      setSessionCookie(reply, token);
      return { ok: true };
    },
  );

  // Sign out: drop the session row and clear the cookie.
  app.post("/api/auth/logout", async (req, reply) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await db.delete(sessions).where(eq(sessions.id, token));
    clearSessionCookie(reply);
    return { ok: true };
  });

  // Change the password. Requires a valid session and the current password.
  app.post("/api/auth/password", async (req, reply) => {
    const user = await getSessionUser(req);
    if (!user) return reply.code(401).send({ error: "Unauthenticated" });

    const body = PasswordBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) });

    const rows = await db
      .select({ passwordHash: users.password_hash })
      .from(users)
      .where(eq(users.id, user.id));

    const row = rows[0];
    if (!row) return reply.code(401).send({ error: "Unauthenticated" });

    const ok = await argon2.verify(row.passwordHash, body.data.currentPassword);
    if (!ok) return reply.code(401).send({ error: "Current password is incorrect" });

    const passwordHash = await argon2.hash(body.data.newPassword);
    await db.update(users).set({ password_hash: passwordHash }).where(eq(users.id, user.id));

    // Invalidate every other session after a password change.
    const currentToken = readCookie(req, SESSION_COOKIE);
    const others = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.user_id, user.id));
    for (const session of others) {
      if (session.id !== currentToken) {
        await db.delete(sessions).where(eq(sessions.id, session.id));
      }
    }

    return { ok: true };
  });
}
