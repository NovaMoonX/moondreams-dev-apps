import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const server = read('functions/src/apps/helm/deleteHelmData.ts');
const recent = read('functions/src/auth/recentSignIn.ts');
const runway = read('functions/src/apps/runway/deleteRunwayPlan.ts');
const readerGrants = read('functions/src/connections/endReaderGrants.ts');
const settings = read('src/apps/helm/store/actions/settingsActions.ts');
const outbox = read('src/apps/helm/store/actions/outboxActions.ts');
const sync = read('src/apps/helm/hooks/useHelmSync.ts');
const row = read('src/apps/helm/components/settings/DeleteHelmData.tsx');
const index = read('functions/src/index.ts');

const at = (source: string, text: string) => {
  const position = source.indexOf(text);
  assert.notEqual(position, -1, `missing: ${text}`);
  return position;
};

const body = server.slice(at(server, 'async (request) =>'));
const steps = [
  'isSignInRecent(',
  "endReaderGrants({ uid, readerAppId: 'helm' })",
  'deleteUserCollections(',
  'deleteMedia(uid)',
  'voiceUsagePath(uid)',
  'deleteServerTree(',
  'userPath(uid)',
].map((step) => at(body, step));
assert.deepEqual(
  steps,
  [...steps].sort((a, b) => a - b),
  'the guard, grants, user collections, media, voice usage, server tree and then the profile run in that order',
);

const tree = server.slice(
  at(server, 'async function deleteServerTree'),
  at(server, 'export const deleteHelmData'),
);
assert.ok(
  at(tree, 'dropBoxKeyPath(uid)') < at(tree, 'firestore.doc(dataKey)') &&
    at(tree, 'firestore.doc(dataKey)') < at(tree, 'serverPath(uid)))'),
  'the wrapped data key is deleted after everything else under the server tree',
);
assert.match(
  server,
  /enforceAppCheck: true/,
  'the callable enforces App Check',
);
assert.match(
  server,
  /!isSignInRecent\(request\.auth\?\.token\?\.auth_time, Date\.now\(\)\)[\s\S]{0,120}'failed-precondition'/,
  'a sign-in that is not recent is refused',
);
assert.match(
  server,
  /apps\/helm\/media\/\$\{uid\}\//,
  'the media prefix is deleted',
);
assert.match(
  index,
  /^export \{ deleteHelmData \} from '\.\/apps\/helm\/deleteHelmData\.js';$/m,
  'the callable is exported in one line',
);

assert.match(recent, /RECENT_SIGN_IN_MS = 5 \* 60 \* 1000/);
assert.match(recent, /export const isSignInRecent/);
assert.match(
  runway,
  /import \{ isSignInRecent \} from '\.\.\/\.\.\/auth\/recentSignIn\.js'/,
  'Runway uses the shared recent sign-in check',
);
assert.doesNotMatch(
  runway,
  /RECENT_SIGN_IN_MS/,
  'Runway keeps no window of its own',
);
assert.match(runway, /export const DELETE_PLAN_PHRASE/);
assert.match(
  readerGrants,
  /where\('readerAppId', '==', readerAppId\)[\s\S]*endAndClean\([\s\S]*deleteCopies: true[\s\S]*revokeUnusedAccount[\s\S]*catch/,
  'every grant of the reader ends with its copies and its unused account, and a failure never stops the rest',
);

assert.match(
  settings,
  /helmTrustStore\s*\.forget\(uid\)[\s\S]*forgetOutboxSecrets\(uid\)[\s\S]*clearHelmKey\(\)[\s\S]*clearHelm\(\)/,
  'this browser forgets the key, the device secrets and the slice',
);
assert.match(
  settings,
  /reauthenticateWithPopup/,
  'the sign-in is renewed in the tap',
);
assert.match(
  settings,
  /keepDeletedNote\(\);\s*window\.location\.replace\(`\$\{window\.location\.pathname\}\?view=today`\)/,
  'every reopen after a delete lands on Today with its one-time note, never the resumed view',
);
assert.doesNotMatch(
  settings,
  /functions\/not-found/,
  'a missing callable is never read as deleted',
);
assert.match(
  settings,
  /signIn\.isStale = true;[\s\S]{0,200}auth\/requires-recent-login/,
  'a late sign-in request is left to the next tap, never opened after the wait',
);
assert.match(
  server,
  /grants\.failed > 0\)[\s\S]{0,80}throw[\s\S]*deleteServerTree\(firestore, uid\)[\s\S]*userPath\(uid\)/,
  'a connection that did not end stops the run before the key and the profile go',
);
assert.match(
  outbox,
  /forgetDeviceSecret\(uid, OUTBOX_SECRET\)[\s\S]*forgetDeviceSecret\(uid, DROP_BOX_KEY_SECRET\)/,
  'the saved list and the drop-box key are forgotten',
);
assert.match(
  sync,
  /profile === null && hadProfile && isFromServer[\s\S]{0,160}forgetHelmOnDevice\(uid\)/,
  'a profile that vanished from the server makes the device forget; a first open does not',
);
assert.match(
  row,
  /useNetworkStatus\(\) === 'offline'/,
  'offline the row is locked',
);
assert.match(row, /destructive: true/, 'the confirm is destructive');

console.log(
  'check:helm-delete: order, guard, shared check and client forgetting hold.',
);
