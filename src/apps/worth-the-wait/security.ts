import {
  createAppEncryptionKey,
  createSeedAppEncryptionKey,
  decryptStringForApp,
  encryptStringForApp,
  normalizeAppEncryption,
  type AppEncryption,
  type EncryptedFieldPayload,
} from '@lib/security';

export type SpaceEncryption = AppEncryption<'worth-the-wait'>;

export function createSpaceEncryptionKey(): SpaceEncryption {
  return createAppEncryptionKey('worth-the-wait');
}

export function createSeedSpaceEncryptionKey(): SpaceEncryption {
  return createSeedAppEncryptionKey('worth-the-wait');
}

export function normalizeSpaceEncryption(value: unknown): SpaceEncryption | null {
  return normalizeAppEncryption(value, 'worth-the-wait');
}

export async function encryptStringForSpace(
  value: string,
  encryption: SpaceEncryption | null | undefined,
): Promise<string | EncryptedFieldPayload> {
  return encryptStringForApp(value, encryption);
}

export async function decryptStringForSpace(
  value: unknown,
  encryption: SpaceEncryption | null | undefined,
): Promise<string> {
  return decryptStringForApp(value, encryption);
}
