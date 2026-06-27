import crypto from "node:crypto";

/**
 * AES-256-GCM encryption helpers (CLAUDE.md §9.3).
 *
 * Used to encrypt courier credentials and the offline Shopify access token at rest.
 * The key comes from APP_ENCRYPTION_KEY and must resolve to exactly 32 bytes.
 * NEVER log decrypted secrets.
 *
 * Ciphertext format (string, safe to store in a Postgres text column):
 *   v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM

let cachedKey: Buffer | null = null;

/** Resolve APP_ENCRYPTION_KEY to a 32-byte Buffer. Accepts hex, base64, or raw utf8. */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY is not set (see .env.example).");
  }

  let key: Buffer | null = null;

  // 64 hex chars -> 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  }

  // base64 that decodes to 32 bytes
  if (!key) {
    try {
      const b = Buffer.from(raw, "base64");
      if (b.length === 32) key = b;
    } catch {
      // fall through
    }
  }

  // raw utf8 of exactly 32 bytes
  if (!key && Buffer.byteLength(raw, "utf8") === 32) {
    key = Buffer.from(raw, "utf8");
  }

  if (!key || key.length !== 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY must resolve to 32 bytes (64-char hex, 32-byte base64, or 32-char utf8).",
    );
  }

  cachedKey = key;
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid ciphertext format.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}
