import type { AppId } from '../types/appCatalog';
import { generateUuid } from '@/utils/idUtils';

export type EncryptionAlgorithm = 'AES-256-GCM';

export type AppEncryption<TAppId extends AppId> = {
  appId: TAppId;
  keyId: string;
  keyVersion: number;
  key: string;
};

export type EncryptedFieldPayload = {
  value: string;
  ciphertext?: string;
  nonce: string;
  keyId: string;
  keyVersion: number;
  algorithm: EncryptionAlgorithm;
};

const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_HEX_LENGTH = KEY_BYTES * 2;

function toBuffer(source: Uint8Array): ArrayBuffer {
  const buffer = new Uint8Array(source.length);
  buffer.set(source);
  return buffer.buffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array {
  const normalized = value.trim();

  if (normalized.length !== KEY_HEX_LENGTH) {
    throw new Error(`Encryption keys must be exactly ${KEY_HEX_LENGTH} hexadecimal characters.`);
  }

  const bytes = new Uint8Array(KEY_BYTES);

  for (let index = 0; index < normalized.length; index += 2) {
    const pair = normalized.slice(index, index + 2);
    bytes[index / 2] = Number.parseInt(pair, 16);
  }

  return bytes;
}

function getCrypto(): Crypto {
  if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
    throw new Error('Web Crypto is not available in this runtime.');
  }

  return globalThis.crypto;
}

// Plain-HTTP origins (a LAN or Tailscale link) have no crypto.subtle; the same AES-GCM runs in JS there.
async function aesGcm(
  mode: 'encrypt' | 'decrypt',
  keyBytes: Uint8Array,
  nonce: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  if (!globalThis.crypto.subtle) {
    const { gcm } = await import('@noble/ciphers/aes.js');
    const cipher = gcm(keyBytes, nonce);
    return mode === 'encrypt' ? cipher.encrypt(data) : cipher.decrypt(data);
  }

  const importedKey = await globalThis.crypto.subtle.importKey(
    'raw',
    toBuffer(keyBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    [mode],
  );
  const algorithm = { name: 'AES-GCM', iv: toBuffer(nonce) };
  const result =
    mode === 'encrypt'
      ? await globalThis.crypto.subtle.encrypt(algorithm, importedKey, toBuffer(data))
      : await globalThis.crypto.subtle.decrypt(algorithm, importedKey, toBuffer(data));
  return new Uint8Array(result);
}

export function createAppEncryptionKey<TAppId extends AppId>(
  appId: TAppId,
  prefix = `${appId}-app-key`,
): AppEncryption<TAppId> {
  const crypto = getCrypto();
  const keyBytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(keyBytes);

  return {
    appId,
    keyId: `${prefix}-${generateUuid()}`,
    keyVersion: 1,
    key: toHex(keyBytes),
  };
}

export function createSeedAppEncryptionKey<TAppId extends AppId>(
  appId: TAppId,
  prefix = `seed-${appId}-app-key`,
): AppEncryption<TAppId> {
  return {
    appId,
    keyId: `${prefix}-v1`,
    keyVersion: 1,
    key: 'd953f53d9d6c3b3d2a748beca467f20b4b74d7cb7cc17a0e7a7f315f8b3e756f',
  };
}

export function normalizeAppEncryption<TAppId extends AppId>(
  value: unknown,
  appId: TAppId,
): AppEncryption<TAppId> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const nextAppId =
    typeof candidate.appId === 'string'
      ? (candidate.appId as TAppId)
      : appId;

  if (
    typeof nextAppId !== 'string' ||
    nextAppId !== appId ||
    typeof candidate.keyId !== 'string' ||
    typeof candidate.keyVersion !== 'number' ||
    typeof candidate.key !== 'string'
  ) {
    return null;
  }

  return {
    appId: nextAppId,
    keyId: candidate.keyId,
    keyVersion: candidate.keyVersion,
    key: candidate.key,
  };
}

export function isEncryptedFieldPayload(value: unknown): value is EncryptedFieldPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const ciphertext = typeof candidate.value === 'string'
    ? candidate.value
    : typeof candidate.ciphertext === 'string'
      ? candidate.ciphertext
      : null;

  return (
    typeof ciphertext === 'string' &&
    typeof candidate.nonce === 'string' &&
    typeof candidate.keyId === 'string' &&
    typeof candidate.keyVersion === 'number' &&
    candidate.algorithm === 'AES-256-GCM'
  );
}

export async function encryptValue(
  value: string,
  rawKey: string,
  keyId: string,
  keyVersion: number,
): Promise<EncryptedFieldPayload> {
  const nonce = getCrypto().getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await aesGcm('encrypt', fromHex(rawKey), nonce, new TextEncoder().encode(value));

  return {
    value: toBase64(ciphertext),
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    keyId,
    keyVersion,
    algorithm: 'AES-256-GCM',
  };
}

export async function decryptValue(
  payload: EncryptedFieldPayload | unknown,
  rawKey: string,
): Promise<string> {
  if (typeof payload === 'string') {
    return payload;
  }

  if (!isEncryptedFieldPayload(payload)) {
    return '';
  }

  const ciphertext = payload.value || payload.ciphertext || '';
  const decrypted = await aesGcm('decrypt', fromHex(rawKey), fromBase64(payload.nonce), fromBase64(ciphertext));

  return new TextDecoder().decode(decrypted);
}

export async function encryptStringForApp<TAppId extends AppId>(
  value: string,
  encryption: AppEncryption<TAppId> | null | undefined,
): Promise<string | EncryptedFieldPayload> {
  if (!encryption) {
    return value;
  }

  return encryptValue(value, encryption.key, encryption.keyId, encryption.keyVersion);
}

export async function decryptStringForApp<TAppId extends AppId>(
  value: unknown,
  encryption: AppEncryption<TAppId> | null | undefined,
): Promise<string> {
  if (typeof value === 'string') {
    return value;
  }

  if (!encryption) {
    return '';
  }

  return decryptValue(value, encryption.key);
}
