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

/** Every Worth the Wait form draft's key starts with it, so drafts are kept only sealed. */
export const FORM_DRAFT_PREFIX = 'worth-the-wait:';

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

/** Seals and opens a form's draft kept on this device, with the space's key. */
export function createDraftSealer(encryption: SpaceEncryption) {
  return {
    seal: async (text: string) => {
      const sealed = await encryptStringForSpace(text, encryption);
      if (typeof sealed === 'string') throw new Error('A draft was not sealed.');
      return sealed;
    },
    open: (sealed: object) => decryptStringForSpace(sealed, encryption),
  };
}
