import { beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

// A deterministic 32-byte test key (hex). Set before importing the module under test.
const TEST_KEY = crypto.randomBytes(32).toString("hex");

let encrypt: (s: string) => string;
let decrypt: (s: string) => string;

beforeAll(async () => {
  process.env.APP_ENCRYPTION_KEY = TEST_KEY;
  const mod = await import("./crypto.server");
  encrypt = mod.encrypt;
  decrypt = mod.decrypt;
});

describe("AES-256-GCM crypto helpers (CLAUDE.md §9.3)", () => {
  it("round-trips a secret", () => {
    const secret = "super-secret-courier-api-key-12345";
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
  });

  it("round-trips unicode and JSON payloads", () => {
    const payload = JSON.stringify({ token: "₹-naïve-🚚", n: 42 });
    expect(decrypt(encrypt(payload))).toBe(payload);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encrypt("same-input");
    const b = encrypt("same-input");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("uses the documented v1 envelope format", () => {
    const parts = encrypt("x").split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("rejects tampered ciphertext (auth tag fails)", () => {
    const enc = encrypt("integrity-protected");
    const parts = enc.split(":");
    const data = Buffer.from(parts[3], "base64");
    data[0] ^= 0xff; // flip a bit
    parts[3] = data.toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
});
