import assert from 'node:assert/strict';

import {
  buildImportWrites,
  createDigest,
  planContactImport,
  planContactUpdate,
  type ContactInput,
  type ExistingWho,
} from '../../functions/src/apps/helm/nomos/contactImport.ts';

const digest = createDigest(Buffer.from('a'.repeat(64), 'hex'));
let counter = 0;
const newId = (collection: 'who' | 'media') =>
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

const run = (requested: string[], existing: ExistingWho[]) =>
  planContactImport({ requested, fetched, existing, newId });

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

console.log('Helm contact import: all checks passed');
