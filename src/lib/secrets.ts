import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Clients' own AI keys (Basic plan): encrypted at rest with AES-256-GCM under AI_KEY_ENCRYPTION_SECRET, a
 * server-side secret from the environment. Without it no key can be stored. Only the server ever decrypts, and only
 * to call the client's own provider for that client's own runs.
 */
const PREFIX = "v1";

function key() {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) return null;
  return createHash("sha256").update(secret).digest();
}

export const secretsConfigured = () => key() !== null;

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("AI key storage isn't configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** The plain key, or null when it can't be read (no secret, a changed secret, tampering). */
export function decryptSecret(blob: string | null | undefined): string | null {
  const k = key();
  if (!k || !blob) return null;
  const [v, iv, tag, data] = blob.split(":");
  if (v !== PREFIX || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// API keys and bearer tokens, by shape: Anthropic (sk-ant-…), OpenAI (sk-… / sk-proj-…), any Bearer header.
const PATTERNS = [/sk-ant-[A-Za-z0-9_-]{8,}/g, /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/g, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi];

/** Text with every API key or token masked, for logs, errors, stored runs and exports. */
export function redactSecrets(text: string, known: (string | null | undefined)[] = []): string {
  let out = text;
  for (const k of known) if (k && k.length >= 8) out = out.split(k).join("[redacted]");
  for (const p of PATTERNS) out = out.replace(p, "[redacted]");
  return out;
}

/** The same for any value headed to a log or a stored record (strings anywhere inside it). */
export function redactDeep<T>(value: T, known: (string | null | undefined)[] = []): T {
  if (typeof value === "string") return redactSecrets(value, known) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, known)) as T;
  if (value instanceof Error) return new Error(redactSecrets(value.message, known)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, known)])) as T;
  return value;
}

/** console.error for server logs, with keys masked. */
export function logError(label: string, err: unknown) {
  console.error(label, redactDeep(err instanceof Error ? err.message : err));
}
