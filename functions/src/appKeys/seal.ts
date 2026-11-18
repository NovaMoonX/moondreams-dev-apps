import { gcmDecrypt, gcmEncrypt } from './gcm.js';

/** Same shape the browser's `@lib/security` produces and opens. */
export interface SealedPayload {
  value: string;
  ciphertext: string;
  nonce: string;
  keyId: string;
  keyVersion: number;
  algorithm: 'AES-256-GCM';
}

/** Seals a JSON object the way the browser does, so a function can write a field the browser opens. */
export function sealWithKey(
  data: { keyId: string; keyVersion: number; key: Buffer },
  fields: Record<string, unknown>,
  schemaVersion: number,
): SealedPayload {
  const { ciphertext, nonce } = gcmEncrypt(
    data.key,
    Buffer.from(JSON.stringify({ v: schemaVersion, ...fields })),
    null,
  );
  const result: SealedPayload = {
    value: ciphertext,
    ciphertext,
    nonce,
    keyId: data.keyId,
    keyVersion: data.keyVersion,
    algorithm: 'AES-256-GCM',
  };
  return result;
}

export function openWithKey(
  key: Buffer,
  sealed: SealedPayload,
): Record<string, unknown> {
  const plain = gcmDecrypt(key, sealed.value, sealed.nonce, null);
  const result = JSON.parse(plain.toString('utf8')) as Record<string, unknown>;
  return result;
}
