import type { CaptureReading } from '@apps/helm/types';

/** Must match `functions/src/apps/helm/dropBox.ts`; `check:helm-drop-box` seals here and opens there. */
const CURVE = 'P-256';
const NO_SALT = new Uint8Array(0);
const NONCE_BYTES = 12;

export const DROP_BOX_MAX_ENVELOPE_CHARS = 12 * 1024;

export interface DropBoxEnvelope {
  id: string;
  epk: string;
  nonce: string;
  ciphertext: string;
  createdAt: number;
}

export interface DropBoxPayload {
  captureId: string;
  text: string;
  reading: CaptureReading;
  inputMode: 'typed' | 'voice';
  createdAt: number;
}

export class DropBoxTooLarge extends Error {
  constructor() {
    super('This is too long to keep on this device.');
  }
}

const utf8 = (value: string) => new TextEncoder().encode(value);

const toBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

/** The public key as the server returns it; `null` when it is not an EC P-256 key. */
export function readDropBoxKey(value: unknown): JsonWebKey | null {
  const key = value as Partial<Record<string, unknown>> | null;
  if (
    typeof key !== 'object' ||
    key === null ||
    key.kty !== 'EC' ||
    key.crv !== CURVE ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string'
  ) {
    return null;
  }
  return { kty: 'EC', crv: CURVE, x: key.x, y: key.y };
}

/** Seals words to the person's drop-box key with WebCrypto alone; the device can't open the result again. */
export async function sealToDropBox(
  uid: string,
  publicKey: JsonWebKey,
  payload: DropBoxPayload,
): Promise<DropBoxEnvelope> {
  const { subtle } = globalThis.crypto;
  const algorithm = { name: 'ECDH', namedCurve: CURVE };
  const theirs = await subtle.importKey('jwk', publicKey, algorithm, false, []);
  const ephemeral = await subtle.generateKey(algorithm, false, ['deriveBits']);
  const shared = await subtle.deriveBits(
    { name: 'ECDH', public: theirs },
    ephemeral.privateKey,
    256,
  );
  const material = await subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveKey',
  ]);
  const key = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: NO_SALT, info: utf8(uid) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: utf8(payload.captureId),
    },
    key,
    utf8(JSON.stringify(payload)),
  );
  const envelope: DropBoxEnvelope = {
    id: payload.captureId,
    epk: toBase64(
      new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey)),
    ),
    nonce: toBase64(nonce),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    createdAt: payload.createdAt,
  };
  if (JSON.stringify(envelope).length > DROP_BOX_MAX_ENVELOPE_CHARS) {
    throw new DropBoxTooLarge();
  }
  return envelope;
}

/** An envelope read back from the device's kept list; `null` when it is not shaped like one. */
export function readEnvelope(value: unknown): DropBoxEnvelope | null {
  const item = value as Partial<DropBoxEnvelope> | null;
  return typeof item === 'object' &&
    item !== null &&
    typeof item.id === 'string' &&
    typeof item.epk === 'string' &&
    typeof item.nonce === 'string' &&
    typeof item.ciphertext === 'string' &&
    typeof item.createdAt === 'number'
    ? {
        id: item.id,
        epk: item.epk,
        nonce: item.nonce,
        ciphertext: item.ciphertext,
        createdAt: item.createdAt,
      }
    : null;
}
