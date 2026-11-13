import assert from 'node:assert/strict';

import {
  buildImportWrites,
  createDigest,
  planContactImport,
  planContactUpdate,
  toWhoId,
  type ContactInput,
  type ExistingWho,
} from '../../functions/src/apps/helm/nomos/contactImport.ts';

const digest = createDigest(Buffer.from('a'.repeat(64), 'hex'));
let counter = 0;
const newId = (collection: 'who' | 'media' | 'keyDates') =>
  `${collection}-${(counter += 1)}`;

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
  email: null,
  phone: null,
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

const sam = who('w-sam', 'Sam Rivera', { email: 'sam.rivera@example.com' });
const samPatel = who('w-patel', 'Sam Patel');
const fetched = [
  contact('people/c1', 'Sam Rivera', {
    emails: ['SAM.RIVERA@example.com'],
    phones: ['+1 (555) 010-2000'],
  }),
  contact('people/c2', 'Priya Raman', { emails: ['priya@example.com'] }),
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
  matched.changes[0]?.fields,
  { phone: '+1 (555) 010-2000' },
  'a match fills only the empty fields',
);

const plainSam = run(['people/c3'], [sam, samPatel]);
assert.equal(plainSam.changes[0]?.before, null, 'an unsure name is a new who');

const emailConflict = run(
  ['people/c1'],
  [who('w-other', 'Sam Rivera', { email: 'other@example.com' })],
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
  email: 'priya@example.com',
  importedFrom: {
    connectorId: 'google:contacts',
    accountId: 'g_1',
    resourceName: 'people/c2',
    importedAt: 1,
  },
  importedFields: {
    name: digest('name', 'Priya Raman'),
    email: digest('email', 'priya@example.com'),
  },
});
const changedAtGoogle = contact('people/c2', 'Priya Raman', {
  emails: ['priya.new@example.com'],
  phones: ['555 010 3000'],
});
const kept = planContactUpdate({
  contact: changedAtGoogle,
  who: imported,
  digest,
  newId,
});
assert.deepEqual(
  kept?.fields,
  { email: 'priya.new@example.com', phone: '555 010 3000' },
  'an unedited field is replaced and a never-imported empty one is filled',
);
assert.equal(
  kept && 'name' in kept.fields,
  false,
  'a name the person edited is kept',
);
const edited = planContactUpdate({
  contact: changedAtGoogle,
  who: { ...imported, email: 'mine@example.com' },
  digest,
  newId,
});
assert.deepEqual(
  edited?.fields,
  { phone: '555 010 3000' },
  'an edited email is kept',
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
  emails: ['priya@example.com'],
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

console.log('Helm contact import: all checks passed');
