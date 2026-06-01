/**
 * Helpers de encryption/decryption para secrets OAuth de plataforma.
 * Reutiliza o mesmo algoritmo do local-encrypted-provider (AES-256-GCM)
 * com a mesma PAPERCLIP_SECRETS_MASTER_KEY, mas opera diretamente sobre TEXT
 * para armazenamento na coluna oauth_app_secret_enc de social_platforms.
 *
 * NUNCA retornar o valor descriptografado em responses de API —
 * usar hasOauthSecret: boolean no lugar.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveDefaultSecretsKeyFilePath } from "../home-paths.js";
import { badRequest } from "../errors.js";

interface EncryptedOauthSecret {
  scheme: "local_encrypted_v1";
  iv: string;
  tag: string;
  ciphertext: string;
}

function decodeMasterKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through
  }
  if (Buffer.byteLength(trimmed, "utf8") === 32) return Buffer.from(trimmed, "utf8");
  return null;
}

export function loadPlatformSecretsKey(): Buffer {
  const envRaw = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  if (envRaw && envRaw.trim().length > 0) {
    const key = decodeMasterKey(envRaw);
    if (!key)
      throw badRequest(
        "Invalid PAPERCLIP_SECRETS_MASTER_KEY (expected 32-byte base64, 64-char hex, or raw 32-char string)",
      );
    return key;
  }

  const keyPath = resolveDefaultSecretsKeyFilePath();
  if (existsSync(keyPath)) {
    const raw = readFileSync(keyPath, "utf8");
    const key = decodeMasterKey(raw);
    if (!key) throw badRequest(`Invalid secrets master key at ${keyPath}`);
    return key;
  }

  // Gera chave nova se não existir — mesma lógica do local-encrypted-provider
  const dir = path.dirname(keyPath);
  mkdirSync(dir, { recursive: true });
  const generated = randomBytes(32);
  writeFileSync(keyPath, generated.toString("base64"), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // best effort
  }
  return generated;
}

export function encryptOauthSecret(plaintext: string): string {
  const masterKey = loadPlatformSecretsKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const material: EncryptedOauthSecret = {
    scheme: "local_encrypted_v1",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(material);
}

export function decryptOauthSecret(encryptedJson: string): string {
  let material: EncryptedOauthSecret;
  try {
    material = JSON.parse(encryptedJson) as EncryptedOauthSecret;
  } catch {
    throw badRequest("Invalid oauth_app_secret_enc format");
  }
  if (
    !material ||
    material.scheme !== "local_encrypted_v1" ||
    typeof material.iv !== "string" ||
    typeof material.tag !== "string" ||
    typeof material.ciphertext !== "string"
  ) {
    throw badRequest("Invalid oauth_app_secret_enc material");
  }

  const masterKey = loadPlatformSecretsKey();
  const iv = Buffer.from(material.iv, "base64");
  const tag = Buffer.from(material.tag, "base64");
  const ciphertext = Buffer.from(material.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
