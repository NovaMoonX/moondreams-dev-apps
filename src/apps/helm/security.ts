import {
  decryptValue,
  encryptValue,
  normalizeAppEncryption,
} from '@lib/security';

import { SEALED_SCHEMA_VERSION } from '@apps/helm/constants';
import type { HelmEncryption, Sealed } from '@apps/helm/types';

export class UnsupportedSealedVersion extends Error {
  constructor() {
    super('This was saved by a newer version of the app.');
  }
}

export const normalizeHelmEncryption = (value: unknown) =>
  normalizeAppEncryption(value, 'helm');

/** Seals a JSON object into one payload; the only place Helm encrypts. */
export async function sealJson<T extends object>(
  fields: T,
  encryption: HelmEncryption,
): Promise<Sealed> {
  const result = await encryptValue(
    JSON.stringify({ v: SEALED_SCHEMA_VERSION, ...fields }),
    encryption.key,
    encryption.keyId,
    encryption.keyVersion,
  );
  return result;
}

/** Opens a sealed payload; throws when it was made with another key, does not open or comes from a newer schema. */
export async function openJson<T extends object>(
  sealed: Sealed,
  encryption: HelmEncryption,
): Promise<T> {
  if (sealed.keyId !== encryption.keyId) {
    throw new Error('A sealed value was made with another key.');
  }
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
