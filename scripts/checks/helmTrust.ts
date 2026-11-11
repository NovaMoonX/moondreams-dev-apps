import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const keyQueries = read('src/apps/helm/queries/helmKeyQueries.ts');
const sync = read('src/apps/helm/hooks/useHelmSync.ts');
const settings = read('src/apps/helm/components/settings/SettingsScreen.tsx');

assert.match(
  keyQueries,
  /createTrustedKeyStore\(/,
  'the key query is the shared trusted-key store',
);
assert.match(
  keyQueries,
  /export const getHelmEncryption = helmKeyStore\.getKey/,
  'every read of the key goes through the store: server first, the kept copy only offline',
);
assert.doesNotMatch(
  keyQueries,
  /localStorage\.setItem\([^)]*(key|encryption)\b/i,
  'the key itself is never written to localStorage',
);
assert.doesNotMatch(keyQueries, /console\./, 'the key query logs nothing');

const guards = sync.match(/isKeptKey\(/g) ?? [];
assert.ok(
  guards.length >= 3,
  'a kept key is checked before the profile, the self who and the ready state',
);
assert.match(
  sync,
  /if \(key && isKeptKey\(key\)\) return;\s*return ensureHelmProfile\(uid\)/,
  'a kept key never creates a profile',
);
assert.match(
  sync,
  /isKeptKey\(encryption\)\s*\?\s*undefined\s*:\s*ensureSelfWho/,
  'a kept key never creates the person',
);
assert.doesNotMatch(
  sync,
  /createDropBoxPair|getHelmKey/,
  'the client never makes a key or a drop-box pair',
);

assert.match(
  settings,
  /<TrustBrowserRow[\s\S]*store=\{helmTrustStore\}/,
  'Settings offers the shared switch over Helm’s store',
);

console.log('helm trust checks passed');
