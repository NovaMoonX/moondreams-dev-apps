export const KEY_BYTES = 32;

export interface Keyring {
  current: string;
  keys: Record<string, string>;
}

/** Emulators only: the keyring used when `functions/.secret.local` has none. */
export const DEV_KEYRING: Keyring = {
  current: 'dev1',
  keys: {
    dev1: '5f2c7a9e1b4d8036c9e5a7f2d1b3c8e04a6f9d2b7c5e1a3f8d4b6c9e2a7f5d31',
  },
};

const isHex32 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

/** Fails closed: a malformed keyring, a `current` outside `keys` or any key that is not 32 bytes throws. */
export function readKeyring(raw: string | undefined | null): Keyring {
  const parsed = parseJson(raw);
  const keys = parsed?.keys;
  if (
    !parsed ||
    typeof parsed.current !== 'string' ||
    !keys ||
    typeof keys !== 'object' ||
    Array.isArray(keys) ||
    Object.keys(keys).length === 0
  ) {
    throw new Error('The master keyring is malformed.');
  }
  if (!Object.hasOwn(keys, parsed.current)) {
    throw new Error('The master keyring names a current key it does not hold.');
  }
  if (!Object.values(keys).every(isHex32)) {
    throw new Error('Every master key must be 32 bytes of hex.');
  }
  const result: Keyring = {
    current: parsed.current,
    keys: keys as Record<string, string>,
  };
  return result;
}

function parseJson(
  raw: string | undefined | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const masterKeyBytes = (keyring: Keyring, masterKeyId: string) => {
  if (!Object.hasOwn(keyring.keys, masterKeyId)) {
    throw new Error(
      'The master key this was wrapped with is not in the keyring.',
    );
  }
  return Buffer.from(keyring.keys[masterKeyId], 'hex');
};
