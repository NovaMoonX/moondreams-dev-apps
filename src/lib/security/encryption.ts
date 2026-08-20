export type EncryptionAlgorithm = 'AES-256-GCM';

export type SpaceEncryption = {
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
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('WebCrypto is not available in this runtime.');
  }

  return globalThis.crypto;
}

export function createSpaceEncryptionKey(prefix = 'worth-the-wait-space'): SpaceEncryption {
  const crypto = getCrypto();
  const keyBytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(keyBytes);

  return {
    keyId: `${prefix}-${crypto.randomUUID()}`,
    keyVersion: 1,
    key: toHex(keyBytes),
  };
}

export function createSeedSpaceEncryptionKey(): SpaceEncryption {
  return {
    keyId: 'seed-worth-the-wait-space-v1',
    keyVersion: 1,
    key: 'd953f53d9d6c3b3d2a748beca467f20b4b74d7cb7cc17a0e7a7f315f8b3e756f',
  };
}

export function normalizeSpaceEncryption(value: unknown): SpaceEncryption | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.keyId !== 'string' ||
    typeof candidate.keyVersion !== 'number' ||
    typeof candidate.key !== 'string'
  ) {
    return null;
  }

  return {
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
  const crypto = getCrypto();
  const keyBytes = fromHex(rawKey);
  const nonce = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const keyBuffer = toBuffer(keyBytes);
  const importedKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    importedKey,
    encoded,
  );
  const ciphertext = new Uint8Array(encrypted);

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

  const crypto = getCrypto();
  const ciphertext = payload.value || payload.ciphertext || '';
  const keyBytes = fromHex(rawKey);
  const nonceBytes = fromBase64(payload.nonce);
  const encryptedValue = fromBase64(ciphertext);
  const keyBuffer = toBuffer(keyBytes);
  const nonceBuffer = toBuffer(nonceBytes);
  const encryptedBuffer = toBuffer(encryptedValue);
  const importedKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonceBuffer },
    importedKey,
    encryptedBuffer,
  );

  return new TextDecoder().decode(decrypted);
}

export async function encryptStringForSpace(
  value: string,
  encryption: SpaceEncryption | null | undefined,
): Promise<string | EncryptedFieldPayload> {
  if (!encryption) {
    return value;
  }

  return encryptValue(value, encryption.key, encryption.keyId, encryption.keyVersion);
}

export async function decryptStringForSpace(
  value: unknown,
  encryption: SpaceEncryption | null | undefined,
): Promise<string> {
  if (typeof value === 'string') {
    return value;
  }

  if (!encryption) {
    return '';
  }

  return decryptValue(value, encryption.key);
}
