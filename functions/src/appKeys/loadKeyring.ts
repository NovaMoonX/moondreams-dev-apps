import { DEV_KEYRING, readKeyring, type Keyring } from './keyring.js';

const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

/** The keyring of one Functions secret: validated on an instance's first call and again whenever the secret's text changes; the emulator's own keyring stands in when the secret is empty there. */
export function createKeyringLoader(secret: { value(): string }) {
  let cached: { raw: string; keyring: Keyring } | null = null;

  const readSecretValue = () => {
    try {
      return secret.value();
    } catch (error) {
      if (!isEmulator()) throw error;
      return '';
    }
  };

  return (): Keyring => {
    const raw = readSecretValue();
    if (cached && cached.raw === raw) return cached.keyring;
    const keyring = !raw && isEmulator() ? DEV_KEYRING : readKeyring(raw);
    cached = { raw, keyring };
    return keyring;
  };
}
