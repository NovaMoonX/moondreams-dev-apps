import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

import { DEV_KEYRING } from '../../functions/src/appKeys/keyring.ts';
import { APP_KEYS } from './apps.ts';

const SECRET_FILE = 'functions/.secret.local';

/**
 * Writes the development keyring for every app master key `functions/.secret.local` lacks, and returns their names.
 * Without one, the functions emulator fetches the production keyring from Secret Manager while the seed seals with the development one, so no seeded account opens. Emulators only.
 */
export function pinDevKeyrings() {
  const text = existsSync(SECRET_FILE) ? readFileSync(SECRET_FILE, 'utf8') : '';
  const names = Object.values(APP_KEYS)
    .map(({ secretName }) => secretName)
    .filter((name) => !new RegExp(`^${name}=`, 'm').test(text));
  if (names.length === 0) return names;
  const lines = names.flatMap((name) => [
    `# ${name}: the development keyring, so the emulator and the seed seal with the same keys (never a production key here)`,
    `${name}='${JSON.stringify(DEV_KEYRING)}'`,
  ]);
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  writeFileSync(SECRET_FILE, `${text}${separator}${lines.join('\n')}\n`);
  chmodSync(SECRET_FILE, 0o600);
  return names;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = pinDevKeyrings();
  if (names.length > 0)
    console.log(
      `✓ Pinned the development keyring for ${names.join(', ')} in ${SECRET_FILE}.`,
    );
}
