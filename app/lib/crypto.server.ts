// Criptografia dos segredos de cliente em repouso (client_secret dos custom
// apps, chaves Resend/Twilio das lojas). AES-256-GCM com chave-mestra em env.
//
// Formato armazenado: base64(iv) + "." + base64(ciphertext) + "." + base64(tag)

import crypto from "node:crypto";

const MASTER_KEY_ENV = "CREDENTIALS_MASTER_KEY";
const IV_LENGTH = 12;

function masterKey(): Buffer {
  const raw = process.env[MASTER_KEY_ENV];
  if (!raw) {
    throw new Error(
      `${MASTER_KEY_ENV} ausente — gere com: openssl rand -base64 32`,
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${MASTER_KEY_ENV} inválida: precisa de 32 bytes em base64`);
  }
  return key;
}

export function hasMasterKey(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, encrypted, tag].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string): string {
  const [ivB64, dataB64, tagB64] = stored.split(".");
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error("segredo armazenado em formato inválido");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Descriptografa devolvendo null em vez de lançar (campo corrompido/da chave
 * antiga não pode derrubar um envio — o chamador cai no fallback). */
export function tryDecryptSecret(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}
