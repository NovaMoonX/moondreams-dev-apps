import type { EncryptedFieldPayload } from './encryption';

const MAX_REMEMBERED_PAYLOADS = 6_000;

type OpenSealed<TEncryption> = <T extends object>(
  sealed: EncryptedFieldPayload,
  encryption: TEncryption,
) => Promise<T>;

/** An opener that keeps what it opened: a snapshot that changes one document opens that one, not its whole window again. The app supplies its own `openJson`, which owns its schema version. */
export function createSealedReader<TEncryption>(
  encryption: TEncryption,
  open: OpenSealed<TEncryption>,
) {
  const remembered = new Map<string, Promise<object>>();
  const read = <T extends object>(
    sealed: EncryptedFieldPayload,
  ): Promise<T> => {
    const key = `${sealed.nonce}:${sealed.value}`;
    const known = remembered.get(key);
    if (known) return known as Promise<T>;
    if (remembered.size >= MAX_REMEMBERED_PAYLOADS) remembered.clear();
    const opening = open<T>(sealed, encryption);
    remembered.set(key, opening);
    opening.catch(() => remembered.delete(key));
    return opening;
  };
  return read;
}

export type SealedReader = ReturnType<typeof createSealedReader>;
