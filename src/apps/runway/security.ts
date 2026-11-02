import {
  decryptBytes,
  decryptValue,
  encryptBytes,
  encryptValue,
  normalizeAppEncryption,
} from '@lib/security';

import { SEALED_SCHEMA_VERSION } from '@apps/runway/constants';
import type { RunwayEncryption, Sealed } from '@apps/runway/types';

export class UnsupportedSealedVersion extends Error {
  constructor() {
    super('This was saved by a newer version of the app.');
  }
}

export function normalizeRunwayEncryption(
  value: unknown,
): RunwayEncryption | null {
  return normalizeAppEncryption(value, 'runway');
}

/** Seals a JSON object into one payload; the only place Runway encrypts. */
export async function sealJson<T extends object>(
  fields: T,
  encryption: RunwayEncryption,
): Promise<Sealed> {
  const text = JSON.stringify({ v: SEALED_SCHEMA_VERSION, ...fields });
  const result = await encryptValue(
    text,
    encryption.key,
    encryption.keyId,
    encryption.keyVersion,
  );
  return result;
}

/** Opens a sealed payload; throws when it does not open or comes from a newer schema. */
export async function openJson<T extends object>(
  sealed: Sealed,
  encryption: RunwayEncryption,
): Promise<T> {
  const text = await decryptValue(sealed, encryption.key);
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('A sealed value did not open.');
  }
  const { v, ...fields } = parsed as { v?: unknown } & Record<string, unknown>;
  if (typeof v !== 'number' || v > SEALED_SCHEMA_VERSION) {
    throw new UnsupportedSealedVersion();
  }
  return fields as T;
}

/** Seals a file's bytes for Storage; the nonce goes in the file's document. */
export const sealBytes = (bytes: Uint8Array, encryption: RunwayEncryption) =>
  encryptBytes(bytes, encryption.key);

/** Opens bytes sealed by `sealBytes`; throws when they do not open. */
export const openBytes = (
  bytes: Uint8Array,
  nonce: string,
  encryption: RunwayEncryption,
) => decryptBytes(bytes, encryption.key, nonce);

const MAX_REMEMBERED_PAYLOADS = 6_000;

/** An opener that keeps what it opened: a snapshot that changes one document opens that one, not its whole window again. */
export function createSealedReader(encryption: RunwayEncryption) {
  const remembered = new Map<string, Promise<object>>();
  const read = <T extends object>(sealed: Sealed): Promise<T> => {
    const key = `${sealed.nonce}:${sealed.value}`;
    const known = remembered.get(key);
    if (known) return known as Promise<T>;
    if (remembered.size >= MAX_REMEMBERED_PAYLOADS) remembered.clear();
    const opening = openJson<T>(sealed, encryption);
    remembered.set(key, opening);
    opening.catch(() => remembered.delete(key));
    return opening;
  };
  return read;
}

export type SealedReader = ReturnType<typeof createSealedReader>;

/** Seals and opens a form's draft kept on this device, with the plan's key. */
export function createDraftSealer(encryption: RunwayEncryption) {
  return {
    seal: (text: string) => sealJson({ draft: text }, encryption),
    open: async (sealed: object) => {
      const { draft } = await openJson<{ draft?: unknown }>(
        sealed as Sealed,
        encryption,
      );
      if (typeof draft !== 'string') throw new Error('A sealed draft did not open.');
      return draft;
    },
  };
}
