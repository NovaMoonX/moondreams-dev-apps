import assert from 'node:assert/strict';

import {
  BRING_IN_SOURCES,
  countBySource,
  planBringIn,
  toCandidates,
  toCountPhrase,
  toSourceKey,
  type BringInCandidate,
} from '../../src/apps/helm/engine/bringIn.ts';
import type {
  OpenWho,
  SyncedRecord,
  WhoKind,
} from '../../src/apps/helm/types.ts';

const source = (categoryId: string) => {
  const found = BRING_IN_SOURCES.find((one) => one.categoryId === categoryId);
  if (!found) throw new Error(categoryId);
  return found;
};

const who = (
  id: string,
  kind: WhoKind,
  name: string,
  more: Partial<OpenWho> = {},
): OpenWho =>
  ({
    id,
    kind,
    name,
    aliases: [],
    refusedAliases: null,
    notes: null,
    phones: [],
    emails: [],
    appSources: [],
    isUnreadable: false,
    ...more,
  }) as unknown as OpenWho;

const candidate = (
  categoryId: string,
  name: string,
  more: Partial<BringInCandidate> = {},
): BringInCandidate => ({
  key: `app:x|${name}`,
  appId: 'x',
  connectorId: 'app:x',
  sourceRefs: [`ref/${name}`],
  source: source(categoryId),
  name,
  detail: null,
  phone: null,
  role: null,
  ...more,
});

const only = (plans: ReturnType<typeof planBringIn>) => {
  assert.equal(plans.length, 1);
  const [plan] = plans;
  if (!plan) throw new Error('no plan');
  return plan;
};

// Nothing like it in the circle: new.
assert.equal(
  only(
    planBringIn([candidate('cats', 'Mittens')], [who('w1', 'person', 'Dana')]),
  ).kind,
  'new',
);

// A name that fits surely is the same, and says what it adds.
const same = only(
  planBringIn(
    [candidate('vets', 'Dr. Patel', { detail: 'Vet at Paws' })],
    [who('w1', 'person', 'Patel')],
  ),
);
assert.equal(same.kind, 'same');
assert.deepEqual(same.kind === 'same' ? same.adds : [], ['Vet at Paws']);

// A pet never merges into a person with the same name.
assert.equal(
  only(planBringIn([candidate('cats', 'Miso')], [who('w1', 'person', 'Miso')]))
    .kind,
  'new',
);
assert.equal(
  only(planBringIn([candidate('cats', 'Miso')], [who('w1', 'pet', 'Miso')]))
    .kind,
  'same',
);

// A first name beside one fuller name is asked about, never merged unasked.
assert.equal(
  only(
    planBringIn(
      [candidate('people', 'Sam', { role: 'Buyer' })],
      [who('w1', 'person', 'Sam Lee')],
    ),
  ).kind,
  'maybe',
);
// ...but two Sams is no one's guess.
assert.equal(
  only(
    planBringIn(
      [candidate('people', 'Sam')],
      [who('w1', 'person', 'Sam Lee'), who('w2', 'person', 'Sam Ortiz')],
    ),
  ).kind,
  'new',
);

// An alias counts as the name.
assert.equal(
  only(
    planBringIn(
      [candidate('people', 'Bobby')],
      [who('w1', 'person', 'Robert Hale', { aliases: ['Bobby'] })],
    ),
  ).kind,
  'same',
);

// A name the person said is not this one is never proposed.
assert.equal(
  only(
    planBringIn(
      [candidate('people', 'Sam')],
      [who('w1', 'person', 'Sam Lee', { refusedAliases: ['Sam'] })],
    ),
  ).kind,
  'new',
);

// A clinic matches a business by its name without the clinic words, or by its phone.
assert.equal(
  only(
    planBringIn(
      [candidate('clinics', 'Paws Veterinary Clinic')],
      [who('w1', 'organization', 'Paws')],
    ),
  ).kind,
  'same',
);
const PHONE = {
  id: 'p',
  value: '555-010-2000',
  label: 'Work',
  isPrimary: true,
};

// A shared phone alone is only a maybe: a clinic's number is every vet's at it.
const byPhone = only(
  planBringIn(
    [candidate('vets', 'Dr. Patel', { phone: '(555) 010-2000' })],
    [who('w1', 'person', 'Dr. Lee', { phones: [PHONE] })],
  ),
);
assert.equal(byPhone.kind, 'maybe');
// ...and sure only once the names relate too.
assert.equal(
  only(
    planBringIn(
      [candidate('vets', 'Sam', { phone: '(555) 010-2000' })],
      [who('w1', 'person', 'Sam Lee', { phones: [PHONE] })],
    ),
  ).kind,
  'same',
);

// A who is surely matched by one candidate per batch; the next is asked as a maybe, never made again.
const twoVets = planBringIn(
  [candidate('vets', 'Dr. Patel'), candidate('vets', 'Dr Patel Jr')],
  [who('w1', 'person', 'Patel'), who('w2', 'person', 'Patel Jr')],
);
assert.equal(
  twoVets.filter((plan) => plan.kind === 'same').length,
  new Set(
    twoVets.flatMap((plan) => (plan.kind === 'same' ? [plan.who.id] : [])),
  ).size,
);
const sharing = planBringIn(
  [
    candidate('vets', 'Sam Lee'),
    candidate('vets', 'Sam', { sourceRefs: ['z'] }),
  ],
  [who('w1', 'person', 'Sam Lee')],
);
assert.deepEqual(
  sharing.map((plan) => [plan.kind, plan.kind === 'new' ? null : plan.who.id]),
  [
    ['same', 'w1'],
    ['maybe', 'w1'],
  ],
);

// A private who is never named while the page is masked: its candidate is held out.
const secret = who('w1', 'person', 'Sam Lee', {
  privacy: 'private',
} as Partial<OpenWho>);
assert.deepEqual(
  planBringIn([candidate('people', 'Sam')], [secret], { isMasked: true }),
  [],
);
assert.equal(
  only(planBringIn([candidate('people', 'Sam')], [secret])).kind,
  'maybe',
);

// What a who already took from a source ref is not offered again.
assert.deepEqual(
  planBringIn(
    [candidate('cats', 'Mittens')],
    [
      who('w1', 'pet', 'Mittens', {
        appSources: [
          { connectorId: 'app:x', sourceRef: 'ref/Mittens', importedAt: 1 },
        ],
      }),
    ],
  ),
  [],
);

// A buyer who asked in two sales is one candidate holding both refs.
const twice = only(
  planBringIn(
    [
      candidate('people', 'Priya', { sourceRefs: ['sales/a/buyers/priya'] }),
      candidate('people', 'priya', { sourceRefs: ['sales/b/buyers/priya'] }),
    ],
    [],
  ),
);
assert.deepEqual(twice.candidate.sourceRefs, [
  'sales/a/buyers/priya',
  'sales/b/buyers/priya',
]);

// An unreadable who is never a match.
assert.equal(
  only(
    planBringIn(
      [candidate('cats', 'Miso')],
      [who('w1', 'pet', '', { isUnreadable: true })],
    ),
  ).kind,
  'new',
);

// Candidates come only from categories that are on, on the connection, and not ended.
const record = (
  category: string,
  title: string,
  more: Partial<SyncedRecord> = {},
): SyncedRecord =>
  ({
    id: title,
    connectorId: 'app:nine-lives',
    category,
    sourceRef: `ref/${title}`,
    connectionEndedAt: null,
    sealed: {
      title,
      subtitle: null,
      detail: null,
      extra: category === 'clinics' ? { phone: '555 0100' } : {},
    },
    ...more,
  }) as unknown as SyncedRecord;
const candidates = toCandidates(
  [
    record('cats', 'Mittens'),
    record('clinics', 'Paws'),
    record('vets', 'Dr. Patel'),
    record('vetVisits', 'Checkup'),
    record('cats', 'Gone', { connectionEndedAt: 5 }),
  ],
  {
    connectorId: 'app:nine-lives',
    appId: 'nine-lives',
    isOn: (category) => category !== 'vets',
  },
);
assert.deepEqual(
  candidates.map((one) => one.name),
  ['Mittens', 'Paws'],
);
assert.equal(candidates[1]?.phone, '555 0100');
assert.equal(candidates[0]?.key, toSourceKey('app:nine-lives', 'ref/Mittens'));

// The offer's words.
const counted = countBySource(
  planBringIn(
    [
      ...['A', 'B', 'C'].map((name) => candidate('cats', name)),
      candidate('clinics', 'Paws'),
      candidate('vets', 'Dr. X'),
      candidate('vets', 'Dr. Y'),
    ],
    [],
  ),
);
assert.equal(
  toCountPhrase(
    counted.map(({ source: one, count }) => ({ count, ...one.noun })),
  ),
  '3 pets, a clinic and 2 vets',
);

console.log('check:helm-bring-in: new, same and maybe are told apart.');
