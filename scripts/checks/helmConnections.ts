// Connections between people: the id is the same whichever way round the pair is written, every family word answers with its reverse (by the other's gender, never a guess), each page reads its own side, a past couple is quiet, a refused proposal is never shown, and the server's copy of the engine behaves the same.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as server from '../../functions/src/apps/helm/nomos/connections.ts';
import {
  KIN_KINDS,
  type KinKind,
} from '../../src/apps/helm/engine/kinKinds.ts';
import {
  buildConnection,
  CONNECTION_STATUSES,
  genderOf,
  isPastStatus,
  isShownConnection,
  readFromSide,
  reverseRelation,
  toConnectionId,
  type ConnectionRecord,
  type Gender,
} from '../../src/apps/helm/engine/connections.ts';
import { selectShownConnections } from '../../src/apps/helm/store/selectors/connectionSelectors.ts';
import type { OpenConnection } from '../../src/apps/helm/types.ts';
import {
  toConnectionSentence,
  toRowTail,
} from '../../src/apps/helm/utils/connectionText.ts';

// The id: sorted pair, then kind, whichever way round.
assert.equal(toConnectionId('b', 'a', 'couple'), 'a_b_couple');
assert.equal(
  toConnectionId('a', 'b', 'couple'),
  toConnectionId('b', 'a', 'couple'),
);
assert.notEqual(
  toConnectionId('a', 'b', 'family'),
  toConnectionId('a', 'b', 'friend'),
);

// A duplicate pair and kind lands on one id, so the create transaction refuses it by existence; a refused one is replaceable.
const ids = new Set([
  toConnectionId('who-1', 'who-2', 'family'),
  toConnectionId('who-2', 'who-1', 'family'),
]);
assert.equal(ids.size, 1, 'the same pair and kind is one document');
assert.equal(isShownConnection({ source: 'page' }), true);
assert.equal(isShownConnection({ source: 'refused' }), false);

// Every reverse pair, by the gender of the one the word describes.
const REVERSES: [KinKind, Gender, KinKind | null][] = [
  ['mother', 'female', 'daughter'],
  ['mother', 'male', 'son'],
  ['mother', null, 'child'],
  ['father', 'female', 'daughter'],
  ['father', 'male', 'son'],
  ['father', null, 'child'],
  ['parent', 'female', 'daughter'],
  ['parent', 'male', 'son'],
  ['parent', null, 'child'],
  ['daughter', 'female', 'mother'],
  ['daughter', 'male', 'father'],
  ['daughter', null, 'parent'],
  ['son', 'female', 'mother'],
  ['son', 'male', 'father'],
  ['son', null, 'parent'],
  ['child', null, 'parent'],
  ['sister', 'female', 'sister'],
  ['sister', 'male', 'brother'],
  ['sister', null, 'sibling'],
  ['brother', 'male', 'brother'],
  ['brother', 'female', 'sister'],
  ['brother', null, 'sibling'],
  ['sibling', 'male', 'brother'],
  ['sibling', null, 'sibling'],
  ['grandmother', 'female', 'grandchild'],
  ['grandfather', null, 'grandchild'],
  ['grandparent', 'male', 'grandchild'],
  ['grandchild', 'female', 'grandmother'],
  ['grandchild', 'male', 'grandfather'],
  ['grandchild', null, 'grandparent'],
  ['aunt', 'female', 'niece'],
  ['aunt', 'male', 'nephew'],
  ['aunt', null, null],
  ['uncle', 'female', 'niece'],
  ['uncle', 'male', 'nephew'],
  ['uncle', null, null],
  ['niece', 'female', 'aunt'],
  ['niece', 'male', 'uncle'],
  ['niece', null, null],
  ['nephew', 'male', 'uncle'],
  ['nephew', null, null],
  ['cousin', 'female', 'cousin'],
  ['cousin', null, 'cousin'],
  ['partner', null, 'partner'],
  ['spouse', 'male', 'spouse'],
  ['motherInLaw', 'female', 'daughterInLaw'],
  ['motherInLaw', 'male', 'sonInLaw'],
  ['fatherInLaw', null, 'childInLaw'],
  ['parentInLaw', 'male', 'sonInLaw'],
  ['daughterInLaw', 'female', 'motherInLaw'],
  ['sonInLaw', 'male', 'fatherInLaw'],
  ['childInLaw', null, 'parentInLaw'],
  ['sisterInLaw', 'male', 'brotherInLaw'],
  ['sisterInLaw', null, 'siblingInLaw'],
  ['brotherInLaw', 'female', 'sisterInLaw'],
  ['siblingInLaw', null, 'siblingInLaw'],
  ['stepmother', 'female', 'stepdaughter'],
  ['stepfather', 'male', 'stepson'],
  ['stepparent', null, 'stepchild'],
  ['stepdaughter', 'female', 'stepmother'],
  ['stepson', 'male', 'stepfather'],
  ['stepchild', null, 'stepparent'],
  ['stepsister', 'male', 'stepbrother'],
  ['stepbrother', 'female', 'stepsister'],
  ['stepsibling', null, 'stepsibling'],
];
REVERSES.forEach(([word, gender, expected]) => {
  assert.equal(
    reverseRelation(word, gender),
    expected,
    `${word} to a ${gender}`,
  );
  assert.equal(
    server.reverseRelation(word, gender),
    expected,
    `server ${word} to a ${gender}`,
  );
});
assert.equal(
  reverseRelation('sister', 'male'),
  'brother',
  'Maya (sister) to Eli, who is male',
);
assert.equal(
  reverseRelation('sister', null),
  'sibling',
  'Maya (sister) to Eli, gender unknown',
);

// Every family word has an answer for each gender; only an aunt, uncle, niece or nephew has none when the gender is unknown.
const NO_NEUTRAL: KinKind[] = ['aunt', 'uncle', 'niece', 'nephew'];
KIN_KINDS.forEach(({ kind }) => {
  (['female', 'male'] as const).forEach((gender) =>
    assert.notEqual(
      reverseRelation(kind, gender),
      null,
      `${kind} to a ${gender} has a word`,
    ),
  );
  assert.equal(
    reverseRelation(kind, null) === null,
    NO_NEUTRAL.includes(kind),
    `${kind} with the gender unknown`,
  );
});

// A gender only from the who's own family word.
const withKin = (kind: KinKind | null) => ({ kin: kind ? { kind } : null });
assert.equal(genderOf(withKin('sister')), 'female');
assert.equal(genderOf(withKin('mother')), 'female');
assert.equal(genderOf(withKin('stepdaughter')), 'female');
assert.equal(genderOf(withKin('brother')), 'male');
assert.equal(genderOf(withKin('father')), 'male');
assert.equal(genderOf(withKin('grandfather')), 'male');
assert.equal(genderOf(withKin('sibling')), null);
assert.equal(genderOf(withKin('cousin')), null);
assert.equal(genderOf(withKin('spouse')), null);
assert.equal(genderOf(withKin(null)), null);
KIN_KINDS.forEach(({ kind }) =>
  assert.equal(
    genderOf(withKin(kind)),
    server.genderOf(withKin(kind)),
    `server gender of ${kind}`,
  ),
);

// buildConnection: sorted, both sides filled, whichever way round it was said.
const maya = 'maya';
const eli = 'eli';
const asSaid = buildConnection(maya, eli, 'family', 'sister', null, null, {
  [eli]: 'male',
});
assert.deepEqual(asSaid.whoIds, [eli, maya]);
assert.equal(asSaid.fromFirst, 'brother', 'eli (first) is a brother to maya');
assert.equal(asSaid.fromSecond, 'sister', 'maya (second) is a sister to eli');
const swapped = buildConnection(eli, maya, 'family', 'brother', null, null, {
  [maya]: 'female',
});
assert.deepEqual(
  swapped,
  asSaid,
  'the same pair said the other way is the same record',
);
const unknown = buildConnection(maya, eli, 'family', 'sister', null, null, {});
assert.equal(unknown.fromFirst, 'sibling');
const notSure = buildConnection(maya, eli, 'family', null, null, null, {});
assert.equal(notSure.fromFirst, null);
assert.equal(notSure.fromSecond, null);
const friends = buildConnection('b', 'a', 'friend', 'sister', 'married', 5, {});
assert.deepEqual([friends.fromFirst, friends.fromSecond], ['friend', 'friend']);
assert.equal(friends.status, null, 'only a couple keeps a status');
const mates = buildConnection('b', 'a', 'work', null, null, null, {});
assert.deepEqual([mates.fromFirst, mates.fromSecond], ['coworker', 'coworker']);
const SINCE = Date.UTC(2019, 5, 20);
const couple = buildConnection(
  'sam',
  'dana',
  'couple',
  null,
  'married',
  SINCE,
  {},
);
assert.deepEqual(couple.whoIds, ['dana', 'sam']);
assert.deepEqual([couple.fromFirst, couple.fromSecond], ['partner', 'partner']);
assert.equal(couple.status, 'married');
assert.equal(couple.since, SINCE);
assert.deepEqual(
  server.buildConnection(maya, eli, 'family', 'sister', null, null, {
    [eli]: 'male',
  }),
  asSaid,
  'the server copy builds the same record',
);

// Each page reads its own side.
const fromEli = readFromSide(asSaid, eli);
assert.deepEqual(fromEli, {
  otherId: maya,
  relation: 'sister',
  status: null,
  since: null,
  isPast: false,
});
const fromMaya = readFromSide(asSaid, maya);
assert.equal(fromMaya?.otherId, eli);
assert.equal(
  fromMaya?.relation,
  'brother',
  "on Maya's page Eli is her brother",
);
assert.equal(readFromSide(asSaid, 'nobody'), null);
assert.deepEqual(server.readFromSide(asSaid, maya), fromMaya);
const sam = readFromSide(couple, 'dana');
assert.equal(sam?.otherId, 'sam');
assert.equal(sam?.status, 'married');
assert.equal(sam?.since, SINCE);

// Row and sentence words.
assert.equal(toRowTail('couple', sam!), 'married');
assert.equal(toRowTail('family', fromMaya!), 'brother');
assert.equal(toRowTail('friend', readFromSide(friends, 'a')!), 'friend');
assert.equal(toRowTail('work', readFromSide(mates, 'a')!), 'coworker');
assert.equal(toRowTail('family', readFromSide(notSure, maya)!), 'family');
assert.equal(
  toConnectionSentence('family', fromMaya!, 'Eli', 'Maya'),
  "Eli is Maya's brother.",
);
assert.match(
  toConnectionSentence('couple', sam!, 'Sam', 'Dana'),
  /^Sam and Dana are married\. Since .*2019\.$/,
);

// A past status is quiet on both pages; the rest are not.
CONNECTION_STATUSES.forEach((status) => {
  const expected = ['separated', 'divorced', 'widowed'].includes(status);
  assert.equal(isPastStatus(status), expected, status);
  assert.equal(server.isPastStatus(status), expected, `server ${status}`);
  const record: ConnectionRecord = { ...couple, status };
  ['dana', 'sam'].forEach((page) =>
    assert.equal(
      readFromSide(record, page)?.isPast,
      expected,
      `${status} on ${page}`,
    ),
  );
});
assert.equal(isPastStatus(null), false);

// A refused document is never shown; one that would not open is not either.
const open = (
  id: string,
  source: OpenConnection['source'],
  isUnreadable = false,
): OpenConnection => ({
  id,
  whoIds: ['a', 'b'],
  kind: 'family',
  source,
  createdBy: 'person',
  executionId: null,
  createdAt: 0,
  lastEditedAt: null,
  fromFirst: 'mother',
  fromSecond: 'daughter',
  status: null,
  since: null,
  isUnreadable,
});
const shown = selectShownConnections.resultFunc([
  open('one', 'page'),
  open('two', 'refused'),
  open('three', 'said'),
  open('four', 'confirmed', true),
  open('five', 'confirmed'),
]);
assert.deepEqual(
  shown.map((entry) => entry.id),
  ['one', 'three', 'five'],
);

// The server's copy is the same file, only its import rewritten.
const source = readFileSync(
  'src/apps/helm/engine/connections.ts',
  'utf8',
).replace('@apps/helm/engine/kinKinds', './kinKinds.js');
assert.equal(
  readFileSync('functions/src/apps/helm/nomos/connections.ts', 'utf8').endsWith(
    source,
  ),
  true,
  'run npm run connections:vendor',
);

console.log('Helm connections: all checks passed');
