import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Credential encryption (AES-256-GCM, key derived from SESSION_SECRET)
// No database import: this module is usable from pure unit tests.
// ---------------------------------------------------------------------------

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "stackpilot", "service-credentials-v1", 32));
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is not set");
  return secret;
}

export function encryptSecret(plain: string, secret = sessionSecret()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decryptSecret(payload: string, secret = sessionSecret()): string {
  const [version, iv, tag, body] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unsupported credential format");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
