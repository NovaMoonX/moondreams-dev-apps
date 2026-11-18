import assert from 'node:assert/strict';

import {
  buildImportWrites,
  createDigest,
  planContactImport,
  planContactUpdate,
  toWhoId,
  type ContactEntry,
  type ContactInput,
  type ExistingWho,
} from '../../functions/src/apps/helm/nomos/contactImport.ts';

const digest = createDigest(Buffer.from('a'.repeat(64), 'hex'));
let counter = 0;
const newId = (collection: 'who' | 'media' | 'keyDates') =>
  `${collection}-${(counter += 1)}`;

const entry = (value: string, label: string | null = null): ContactEntry => ({
  value,
  label,
});
const point = (value: string, label = 'Other', isPrimary = true) => ({
  id: `p-${value}`,
  value,
  label,
  isPrimary,
});

const contact = (
  resourceName: string,
  name: string,
  extra: Partial<ContactInput> = {},
): ContactInput => ({
  resourceName,
  name,
  emails: [],
  phones: [],
  photoUrl: null,
  ...extra,
});

const who = (id: string, name: string, extra: Partial<ExistingWho> = {}) => ({
  id,
  kind: 'person' as const,
  isSelf: false,
  name,
  aliases: [],
  emails: [],
  phones: [],
  photoMediaId: null,
  mediaIds: [],
  importedFrom: null,
  importedFields: {},
  lastMentionedAt: null,
  yearlyDateCount: 0,
  birthday: null,
  sealed: { name },
  sealedNonce: 'nonce',
  ...extra,
});

const sam = who('w-sam', 'Sam Rivera', {
  emails: [point('sam.rivera@example.com')],
});
const samPatel = who('w-patel', 'Sam Patel');
const fetched = [
  contact('people/c1', 'Sam Rivera', {
    emails: [entry('SAM.RIVERA@example.com', 'Work')],
    phones: [entry('+1 (555) 010-2000', 'Mobile')],
  }),
  contact('people/c2', 'Priya Raman', {
    emails: [entry('priya@example.com')],
  }),
  contact('people/c3', 'Sam'),
  contact('people/c4', 'Not Ticked'),
];

const run = (
  requested: string[],
  existing: ExistingWho[],
  all: ContactInput[] = fetched,
  accountId = 'g_1',
) =>
  planContactImport({
    requested,
    fetched: all,
    existing,
    accountId,
    digest,
    newId,
  });

const forged = run(['people/c2', 'people/forged'], []);
assert.deepEqual(
  forged.changes.map((change) => change.contact.name),
  ['Priya Raman'],
  'a name Google did not return is ignored',
);

const unticked = run(['people/c2'], [sam]);
assert.equal(
  unticked.changes.some((change) => change.contact.name === 'Not Ticked'),
  false,
  'a contact that was not ticked is never written',
);

const matched = run(['people/c1'], [sam, samPatel]);
assert.equal(matched.changes.length, 1);
assert.equal(matched.changes[0]?.id, 'w-sam', 'email beats the name');
assert.deepEqual(
  matched.changes[0]?.contacts?.phones?.map(({ value, label, isPrimary }) => ({
    value,
    label,
    isPrimary,
  })),
  [{ value: '+1 (555) 010-2000', label: 'Mobile', isPrimary: true }],
  'a match brings in the number it lacked, with its Google label, as primary',
);
assert.equal(
  matched.changes[0]?.contacts?.emails ?? null,
  null,
  'an address already held (any case) is not added again',
);

const plainSam = run(['people/c3'], [sam, samPatel]);
assert.equal(plainSam.changes[0]?.before, null, 'an unsure name is a new who');

const emailConflict = run(
  ['people/c1'],
  [who('w-other', 'Sam Rivera', { emails: [point('other@example.com')] })],
);
assert.equal(
  emailConflict.changes[0]?.before,
  null,
  'a same name with a different email is a new person',
);

const sameName = [
  contact('people/n1', 'Jo Park'),
  contact('people/n2', 'Jo Park'),
];
const batch = run(['people/n1', 'people/n2'], [], sameName);
assert.equal(batch.changes.length, 2, 'two same-name contacts are two people');
assert.notEqual(batch.changes[0]?.id, batch.changes[1]?.id);

const laterBatch = run(
  ['people/n2'],
  [
    who('w-jo', 'Jo Park', {
      importedFrom: {
        connectorId: 'google:contacts',
        accountId: 'g_1',
        resourceName: 'people/n1',
        importedAt: 1,
      },
    }),
  ],
  sameName,
);
assert.equal(
  laterBatch.changes[0]?.before,
  null,
  'a second same-name contact in a later batch is a new person',
);

const otherAccount = run(
  ['people/c2'],
  [
    who('w-priya', 'Someone Else', {
      importedFrom: {
        connectorId: 'google:contacts',
        accountId: 'g_2',
        resourceName: 'people/c2',
        importedAt: 1,
      },
    }),
  ],
  fetched,
  'g_1',
);
assert.equal(
  otherAccount.changes[0]?.before,
  null,
  'the same resource name from another account is not a match',
);

assert.equal(
  toWhoId(digest, 'g_1', 'people/c2'),
  toWhoId(digest, 'g_1', 'people/c2'),
  'the new person id is stable',
);
assert.equal(
  run(['people/c2'], []).changes[0]?.id,
  toWhoId(digest, 'g_1', 'people/c2'),
  'a new person takes the derived id',
);
assert.notEqual(
  toWhoId(digest, 'g_1', 'people/c2'),
  toWhoId(digest, 'g_2', 'people/c2'),
);

const twice = run(['people/c1', 'people/c1'], [sam]);
assert.equal(twice.changes.length, 1, 'one contact is one change');

const imported = who('w-priya', 'Priya R', {
  emails: [point('priya@example.com')],
  importedFrom: {
    connectorId: 'google:contacts',
    accountId: 'g_1',
    resourceName: 'people/c2',
    importedAt: 1,
  },
  importedFields: {
    name: digest('name', 'Priya Raman'),
  },
});
const changedAtGoogle = contact('people/c2', 'Priya Raman', {
  emails: [entry('priya.new@example.com', 'Work')],
  phones: [entry('555 010 3000')],
});
const kept = planContactUpdate({
  contact: changedAtGoogle,
  who: imported,
  digest,
  newId,
});
assert.deepEqual(
  kept?.contacts?.emails?.map(({ value, label, isPrimary }) => [
    value,
    label,
    isPrimary,
  ]),
  [
    ['priya@example.com', 'Other', true],
    ['priya.new@example.com', 'Work', false],
  ],
  'a new address is added beside the old one and the primary stays',
);
assert.deepEqual(
  kept?.contacts?.phones?.map(({ label, isPrimary }) => [label, isPrimary]),
  [['Other', true]],
  'a number with no Google label is Other',
);
assert.deepEqual(kept?.fields, {}, 'the name the person edited is kept');
const removedByPerson = planContactUpdate({
  contact: changedAtGoogle,
  who: {
    ...imported,
    importedFields: {
      ...imported.importedFields,
      [`email.${digest('email', 'priya.new@example.com').slice(0, 16)}`]: '1',
    },
  },
  digest,
  newId,
});
assert.equal(
  removedByPerson?.contacts?.emails ?? null,
  null,
  'an address the person removed after it was brought in stays removed',
);
const removedLegacy = planContactUpdate({
  contact: changedAtGoogle,
  who: {
    ...imported,
    importedFields: {
      ...imported.importedFields,
      email: digest('email', 'priya.new@example.com'),
    },
  },
  digest,
  newId,
});
assert.equal(
  removedLegacy?.contacts?.emails ?? null,
  null,
  'an address the old single-field mark covers and the person removed stays removed',
);
const editedPrimary = planContactUpdate({
  contact: changedAtGoogle,
  who: { ...imported, emails: [point('mine@example.com', 'Home')] },
  digest,
  newId,
});
assert.equal(
  editedPrimary?.contacts?.emails?.find((entry) => entry.isPrimary)?.value,
  'mine@example.com',
  "the person's own primary stays primary",
);

const writes = buildImportWrites({
  changes: forged.changes,
  photos: new Map(),
  accountId: 'g_1',
  now: 1_000,
  executionId: 'exec-1',
  keyId: 'key-1',
  digest,
  seal: (fields) => ({
    value: 'x',
    ciphertext: Buffer.from(JSON.stringify(fields)).toString('base64'),
    nonce: 'n',
    keyId: 'key-1',
    keyVersion: 1,
    algorithm: 'AES-256-GCM',
  }),
});
const readable = JSON.stringify(
  writes.whoCreates.map(({ data }) => ({ ...data, sealed: null })),
);
['Priya Raman', 'priya@example.com'].forEach((text) =>
  assert.equal(readable.includes(text), false, `${text} stays inside the seal`),
);
assert.equal(writes.createdCount, 1);
assert.equal(writes.whoCreates[0]?.data.createdBy, 'person');
assert.equal(writes.whoCreates[0]?.data.lastMentionedAt, null);

const withBirthday = contact('people/c9', 'Priya Raman', {
  emails: [entry('priya@example.com')],
  birthday: { month: 4, day: 22, year: null },
});
const birthdayImport = run(['people/c9'], [], [withBirthday]);
assert.equal(birthdayImport.changes[0]?.birthday?.kind, 'add');
assert.deepEqual(birthdayImport.changes[0]?.birthday?.value, {
  month: 4,
  day: 22,
  year: null,
});

const fromGoogle = { month: 4, day: 22, year: null };
const withDate = (
  held: { month: number; day: number | null; year: number | null },
  imported: boolean,
) =>
  who('w-priya', 'Priya Raman', {
    birthday: { id: 'k-1', ...held },
    yearlyDateCount: 1,
    importedFields: imported ? { birthday: digest('birthday', '4-22-') } : {},
  });
const moved = { ...withBirthday, birthday: { month: 4, day: 23, year: null } };
const replaced = planContactUpdate({
  contact: moved,
  who: withDate(fromGoogle, true),
  digest,
  newId,
});
assert.equal(
  replaced?.birthday?.kind,
  'replace',
  'a birthday still as imported follows Google',
);
const editedByPerson = planContactUpdate({
  contact: moved,
  who: withDate({ month: 4, day: 22, year: 1990 }, true),
  digest,
  newId,
});
assert.equal(
  editedByPerson?.birthday ?? null,
  null,
  'Update from Google keeps a birthday the person edited',
);
const saidByPerson = planContactUpdate({
  contact: moved,
  who: withDate(fromGoogle, false),
  digest,
  newId,
});
assert.equal(
  saidByPerson?.birthday ?? null,
  null,
  'a birthday that was never imported is never replaced',
);

const removed = planContactUpdate({
  contact: moved,
  who: who('w-priya', 'Priya Raman', {
    importedFields: { birthday: digest('birthday', '4-22-') },
  }),
  digest,
  newId,
});
assert.equal(
  removed?.birthday ?? null,
  null,
  'a birthday the person removed stays removed',
);
const neverImported = planContactUpdate({
  contact: moved,
  who: who('w-priya', 'Priya Raman'),
  digest,
  newId,
});
assert.equal(neverImported?.birthday?.kind, 'add');

const badYear = run(
  ['people/c9'],
  [],
  [{ ...withBirthday, birthday: { month: 4, day: 22, year: 3000 } }],
);
assert.deepEqual(
  badYear.changes[0]?.birthday?.value,
  fromGoogle,
  'a year that cannot be one is dropped',
);
const badDay = run(
  ['people/c9'],
  [],
  [{ ...withBirthday, birthday: { month: 2, day: 30, year: null } }],
);
assert.equal(
  badDay.changes[0]?.birthday ?? null,
  null,
  'a day that is not in the month keeps no birthday',
);

const openSealed = (data: Record<string, unknown> | undefined) =>
  JSON.parse(
    Buffer.from(
      (data?.sealed as { ciphertext: string }).ciphertext,
      'base64',
    ).toString(),
  ) as Record<string, unknown>;

const many = contact('people/m1', 'Dana Whitfield', {
  phones: [
    entry('+1 415 555 0142', 'Mobile'),
    entry('(415) 555-0142', 'Home'),
    entry('+1 415 555 0188', 'Work'),
    entry('+1 415 555 0199', 'A label that is far too long to keep'),
  ],
  emails: [
    entry('dana@example.com', 'Home'),
    entry('Dana@Example.com', 'Work'),
    entry('dana@work.example.com', 'Work'),
  ],
});
const bigImport = run(['people/m1'], [], [many]);
const bigChange = bigImport.changes[0];
assert.deepEqual(
  bigChange?.contacts?.phones?.map(({ value, label, isPrimary }) => [
    value,
    label,
    isPrimary,
  ]),
  [
    ['+1 415 555 0142', 'Mobile', true],
    ['+1 415 555 0188', 'Work', false],
    ['+1 415 555 0199', 'A label that is far', false],
  ],
  'every number is kept with its label, the same digits once, a label cut to 20, the first primary',
);
assert.deepEqual(
  bigChange?.contacts?.emails?.map(({ value, label, isPrimary }) => [
    value,
    label,
    isPrimary,
  ]),
  [
    ['dana@example.com', 'Home', true],
    ['dana@work.example.com', 'Work', false],
  ],
  'every address is kept with its label, a repeat in another case once',
);
const manyWrites = buildImportWrites({
  changes: bigImport.changes,
  photos: new Map(),
  accountId: 'g_1',
  now: 1_000,
  executionId: 'exec-2',
  keyId: 'key-1',
  digest,
  seal: (fields) => ({
    value: 'x',
    ciphertext: Buffer.from(JSON.stringify(fields)).toString('base64'),
    nonce: 'n',
    keyId: 'key-1',
    keyVersion: 1,
    algorithm: 'AES-256-GCM',
  }),
});
const sealedDana = openSealed(manyWrites.whoCreates[0]?.data);
assert.equal((sealedDana.phones as unknown[]).length, 3);
assert.equal((sealedDana.emails as unknown[]).length, 2);
assert.equal(sealedDana.phone, null, 'the old single phone is written null');
assert.equal(sealedDana.email, null, 'the old single email is written null');

const twelve = contact('people/m2', 'Twelve Numbers', {
  phones: Array.from({ length: 12 }, (_, index) =>
    entry(`+1 415 555 01${String(index).padStart(2, '0')}`, 'Other'),
  ),
});
assert.equal(
  run(['people/m2'], [], [twelve]).changes[0]?.contacts?.phones?.length,
  10,
  'at most 10 numbers are kept',
);

const holdsTwo = who('w-two', 'Dana Whitfield', {
  phones: [
    point('+1 415 555 0001', 'Home'),
    point('+1 415 555 0188', 'Work', false),
  ],
  emails: [point('dana.old@example.com', 'Other')],
});
const bySecondNumber = run(
  ['people/m1'],
  [holdsTwo, who('w-dana2', 'Dana Whitfield')],
  [many],
);
assert.equal(
  bySecondNumber.changes[0]?.id,
  'w-two',
  "a contact matches the person by any of the person's numbers",
);
const bySecondEmail = run(
  ['people/m3'],
  [
    who('w-mail', 'Someone', {
      emails: [
        point('a@example.com', 'Home'),
        point('dana@work.example.com', 'Work', false),
      ],
    }),
  ],
  [
    contact('people/m3', 'Dana W', {
      emails: [entry('dana@work.example.com')],
      phones: [entry('555 010 4444')],
    }),
  ],
);
assert.equal(
  bySecondEmail.changes[0]?.id,
  'w-mail',
  "a contact matches the person by any of the person's addresses",
);
const filled = run(['people/m1'], [holdsTwo], [many]).changes[0];
assert.deepEqual(
  filled?.contacts?.phones?.map((entry) => [entry.value, entry.isPrimary]),
  [
    ['+1 415 555 0001', true],
    ['+1 415 555 0188', false],
    ['+1 415 555 0142', false],
    ['+1 415 555 0199', false],
  ],
  "a match keeps the person's own numbers and primary and adds the rest",
);
const filledEffect = buildImportWrites({
  changes: filled ? [filled] : [],
  photos: new Map(),
  accountId: 'g_1',
  now: 1_000,
  executionId: 'exec-3',
  keyId: 'key-1',
  digest,
  seal: (fields) => ({
    value: 'x',
    ciphertext: Buffer.from(JSON.stringify(fields)).toString('base64'),
    nonce: 'n',
    keyId: 'key-1',
    keyVersion: 1,
    algorithm: 'AES-256-GCM',
  }),
});
assert.equal(
  filledEffect.effects[0]?.previous?.['sealed.phone'],
  null,
  'Undo puts the old single phone back',
);

console.log('Helm contact import: all checks passed');
