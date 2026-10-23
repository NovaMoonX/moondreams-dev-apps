import {
  decryptValue,
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
