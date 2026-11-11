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

assert.match(
  sync,
  /if \(isKept\) \{\s*window\.addEventListener\('online', retryOnline\);[\s\S]{0,400}\} else \{\s*void ensureHelmProfile\(uid\)/,
  'only the server’s key starts a profile; a kept key asks the server again once online',
);
assert.equal(
  (sync.match(/ensureHelmProfile\(/g) ?? []).length,
  1,
  'the profile is started in one place, after the key',
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

const callable = read('functions/src/auth/signOutEverywhere.ts');
assert.ok(
  callable.includes('`trustedBrowsers/${uid}/browsers`') &&
    callable.indexOf('recursiveDelete') <
      callable.indexOf('revokeRefreshTokens'),
  'sign out everywhere deletes the trusted entries before it revokes sessions',
);
assert.match(
  callable,
  /enforceAppCheck: true/,
  'the callable enforces App Check',
);
assert.match(
  callable,
  /const uid = request\.auth\?\.uid;\s*if \(!uid\)/,
  'the callable acts only on the signed-in account',
);
assert.doesNotMatch(
  callable,
  /\b(helm|runway|pinch|recipes?|trips?|waypoint)\b/i,
  'the site callable carries no app’s words',
);
assert.doesNotMatch(
  read('src/apps/runway/screens/plan/SettingsScreen.tsx'),
  /onSignOutEverywhere/,
  'Runway does not offer sign out everywhere',
);
assert.match(
  settings,
  /onSignOutEverywhere=\{async \(\) => \{\s*await signOutEverywhere\(\);[\s\S]{0,160}?await logOut\(\{\s*hasAskedFirst: true,[\s\S]{0,80}?\}\)\.catch\(/,
  'Helm signs this browser out only after the server has ended every session, and leaves even if cleanup fails',
);
const row = read('src/components/TrustBrowserRow.tsx');
assert.ok(
  row.indexOf('getSignOutQuestions(uid)') > -1 &&
    row.indexOf('getSignOutQuestions(uid)') <
      row.indexOf('onSignOutEverywhere().catch'),
  'unsent work is asked about before the server ends any session',
);

console.log('helm trust checks passed');
