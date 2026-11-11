import { webcrypto } from 'node:crypto';

import { gcmDecrypt, gcmEncrypt } from '../../appKeys/gcm.js';
import { masterKeyBytes, type Keyring } from '../../appKeys/keyring.js';
import type { SealedPayload } from '../../appKeys/seal.js';

const { subtle } = webcrypto;

/** Must match the device's `utils/dropBox.ts`; `check:helm-drop-box` seals there and opens here. */
const CURVE = 'P-256';
const NO_SALT = new Uint8Array(0);

export const DROP_BOX_MAX_ITEMS = 20;
export const DROP_BOX_MAX_ENVELOPE_CHARS = 12 * 1024;
export const DROP_BOX_TEXT_MAX_CHARS = 4_000;
const FUTURE_SLACK_MS = 5 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const NONCE_CHARS = 16;
const EPK_CHARS = 88;
const INPUT_MODES = ['typed', 'voice'] as const;

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
  reading: object;
  inputMode: (typeof INPUT_MODES)[number];
  createdAt: number;
}

/** What `server/{uid}/keys/dropBox` holds: the public key for the device, the private key wrapped under a master key. */
export interface DropBoxKeyDoc {
  publicJwk: { kty: string; crv: string; x: string; y: string };
  wrappedPrivateKey: string;
  nonce: string;
  masterKeyId: string;
  createdAt: number;
}

const utf8 = (value: string) => new TextEncoder().encode(value);
const utf8Buffer = (value: string) => Buffer.from(value, 'utf8');

export async function createDropBoxPair() {
  const pair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveBits'],
  );
  const { kty, crv, x, y } = await subtle.exportKey('jwk', pair.publicKey);
  const result = {
    publicJwk: { kty, crv, x, y } as DropBoxKeyDoc['publicJwk'],
    privateKey: Buffer.from(await subtle.exportKey('pkcs8', pair.privateKey)),
  };
  return result;
}

export function wrapDropBoxKey(
  keyring: Keyring,
  uid: string,
  pair: { publicJwk: DropBoxKeyDoc['publicJwk']; privateKey: Buffer },
  createdAt: number,
): DropBoxKeyDoc {
  const { ciphertext, nonce } = gcmEncrypt(
    masterKeyBytes(keyring, keyring.current),
    pair.privateKey,
    utf8Buffer(uid),
  );
  const result: DropBoxKeyDoc = {
    publicJwk: pair.publicJwk,
    wrappedPrivateKey: ciphertext,
    nonce,
    masterKeyId: keyring.current,
    createdAt,
  };
  return result;
}

/** Throws when the master key is missing or the key no longer opens; callers never replace a key on a throw. */
export const unwrapDropBoxKey = (
  keyring: Keyring,
  uid: string,
  stored: DropBoxKeyDoc,
) =>
  gcmDecrypt(
    masterKeyBytes(keyring, stored.masterKeyId),
    stored.wrappedPrivateKey,
    stored.nonce,
    utf8Buffer(uid),
  );

const isBase64 = (value: unknown): value is string =>
  typeof value === 'string' && BASE64_PATTERN.test(value);

/** The envelope's shape and size; `null` for anything else. */
export function readEnvelope(value: unknown): DropBoxEnvelope | null {
  const item = value as Partial<DropBoxEnvelope> | null;
  if (
    typeof item !== 'object' ||
    item === null ||
    typeof item.id !== 'string' ||
    !ID_PATTERN.test(item.id) ||
    !isBase64(item.epk) ||
    item.epk.length !== EPK_CHARS ||
    !isBase64(item.nonce) ||
    item.nonce.length !== NONCE_CHARS ||
    !isBase64(item.ciphertext) ||
    typeof item.createdAt !== 'number' ||
    !Number.isFinite(item.createdAt) ||
    JSON.stringify(value).length > DROP_BOX_MAX_ENVELOPE_CHARS
  ) {
    return null;
  }
  return {
    id: item.id,
    epk: item.epk,
    nonce: item.nonce,
    ciphertext: item.ciphertext,
    createdAt: item.createdAt,
  };
}

/** Opens one envelope with the person's private key; throws when it was sealed to another key or person, or was changed. */
export async function openEnvelope(
  privateKey: Buffer,
  uid: string,
  envelope: DropBoxEnvelope,
): Promise<unknown> {
  const mine = await subtle.importKey(
    'pkcs8',
    privateKey,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    ['deriveBits'],
  );
  const theirs = await subtle.importKey(
    'raw',
    Buffer.from(envelope.epk, 'base64'),
    { name: 'ECDH', namedCurve: CURVE },
    false,
    [],
  );
  const shared = await subtle.deriveBits(
    { name: 'ECDH', public: theirs },
    mine,
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
    ['decrypt'],
  );
  const plain = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: Buffer.from(envelope.nonce, 'base64'),
      additionalData: utf8(envelope.id),
    },
    key,
    Buffer.from(envelope.ciphertext, 'base64'),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as unknown;
}

/** What an opened envelope must hold to become a capture; `null` otherwise. The words are trimmed and capped like a direct turn's. */
export function readPayload(
  value: unknown,
  envelope: DropBoxEnvelope,
  now: number,
): DropBoxPayload | null {
  const payload = value as Partial<DropBoxPayload> | null;
  if (typeof payload !== 'object' || payload === null) return null;
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (
    payload.captureId !== envelope.id ||
    text.length === 0 ||
    text.length > DROP_BOX_TEXT_MAX_CHARS ||
    typeof payload.reading !== 'object' ||
    payload.reading === null ||
    Array.isArray(payload.reading) ||
    !INPUT_MODES.some((mode) => mode === payload.inputMode) ||
    payload.createdAt !== envelope.createdAt ||
    envelope.createdAt <= 0 ||
    envelope.createdAt > now + FUTURE_SLACK_MS
  ) {
    return null;
  }
  return {
    captureId: envelope.id,
    text,
    reading: payload.reading,
    inputMode: payload.inputMode as DropBoxPayload['inputMode'],
    createdAt: envelope.createdAt,
  };
}

/** Splits what was opened into what to create, what the person's Helm already holds and what can never import; a repeated id creates nothing. */
export function planImport(
  opened: { id: string; payload: DropBoxPayload | null }[],
  existing: ReadonlySet<string>,
) {
  return opened.reduce(
    (plan, { id, payload }) => {
      if (payload === null)
        return { ...plan, rejected: [...plan.rejected, id] };
      const isHeld =
        existing.has(id) ||
        plan.toCreate.some((entry) => entry.captureId === id);
      return isHeld
        ? { ...plan, held: [...plan.held, id] }
        : {
            ...plan,
            toCreate: [...plan.toCreate, payload],
            held: [...plan.held, id],
          };
    },
    {
      toCreate: [] as DropBoxPayload[],
      held: [] as string[],
      rejected: [] as string[],
    },
  );
}

/** The turn as a direct capture would be written, minus anything the device alone knows; it is unseen so it lands in "New since you looked" once sorted. */
export function buildDropBoxCapture(
  payload: DropBoxPayload,
  sealed: SealedPayload,
) {
  const result = {
    inputMode: payload.inputMode,
    sttProvider: null,
    interruptedCaptureId: null,
    answersQuestion: null,
    ttsProvider: null,
    arrivedVia: 'dropBox',
    medium: 'web',
    sessionId: payload.captureId,
    turnIndex: 0,
    route: null,
    status: 'received',
    heldReason: null,
    claimId: null,
    claimedAt: null,
    attempts: 0,
    lastErrorCode: null,
    questionState: {},
    executionIds: [],
    turnLeadId: null,
    joinedCaptureIds: [],
    attachmentIds: [],
    seenAt: null,
    quotedSourceKeys: [],
    answerSavedNoteId: null,
    whoIds: [],
    placeIds: [],
    planDayKey: null,
    createdAt: payload.createdAt,
    sortedAt: null,
    screen: null,
    sealed,
  };
  return result;
}
