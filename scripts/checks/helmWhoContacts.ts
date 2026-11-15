// Several labelled phones and emails per who: the old single value read as one primary, one primary always, removing the primary, repeats refused by digits, the label and list caps, and a typed number planned as one undoable rewrite.
import assert from 'node:assert/strict';

import {
  readContactPoints,
  toContactPoints,
} from '../../functions/src/apps/helm/nomos/contactPoints.ts';
import {
  addContactPoint,
  changeContactPoint,
  applyContactDiff,
  CONTACT_LABEL_CAP,
  contactLabelsFor,
  diffContactPoints,
  makePrimaryContactPoint,
  MAX_CONTACT_POINTS,
  pickContactPoint,
  restoreContactPoint,
  removeContactPoint,
  toContactKey,
  toContactLabel,
  type ContactPoint,
} from '../../src/apps/helm/engine/contactPoints.ts';
import type { AddContactPointCommand } from '../../functions/src/apps/helm/nomos/commands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  toDialableNumber,
  toMailtoUrl,
  toTextableNumber,
} from '../../src/utils/contactUtils.ts';
import { planContactPoints } from '../../functions/src/apps/helm/nomos/planContactPoints.ts';

const point = (
  id: string,
  value: string,
  label = 'Other',
  isPrimary = false,
): ContactPoint => ({ id, value, label, isPrimary });

const unwrap = (result: ReturnType<typeof addContactPoint>) => {
  assert.equal(typeof result, 'object', `expected a list, got ${result}`);
  return (result as { points: ContactPoint[] }).points;
};

const primaries = (points: ContactPoint[]) =>
  points.filter((entry) => entry.isPrimary).map((entry) => entry.id);

// Legacy: a payload with only phone and email reads as one primary each, labelled Other.
const legacy = { phone: '(415) 555-0142', email: 'dana@example.com' };
assert.deepEqual(readContactPoints('phone', legacy), [
  point('legacy-phone', '(415) 555-0142', 'Other', true),
]);
assert.deepEqual(readContactPoints('email', legacy), [
  point('legacy-email', 'dana@example.com', 'Other', true),
]);
assert.deepEqual(readContactPoints('phone', { phone: null }), []);
assert.deepEqual(readContactPoints('phone', { phone: '   ' }), []);
assert.deepEqual(readContactPoints('phone', {}), []);
assert.deepEqual(
  readContactPoints('phone', {
    phones: [],
    phone: '555 0100',
  }),
  [],
  'a list that is there wins over the old single value, even when empty',
);
assert.equal(
  readContactPoints('phone', {
    phones: [point('a', '555 010 0001', 'Work', true)],
    phone: '555 0100',
  })[0]?.label,
  'Work',
);

// Exactly one primary when any, whatever was stored.
assert.deepEqual(
  primaries(
    toContactPoints('phone', [
      point('a', '555 010 0001'),
      point('b', '555 010 0002'),
    ]),
  ),
  ['a'],
  'none marked: the first is primary',
);
assert.deepEqual(
  primaries(
    toContactPoints('phone', [
      point('a', '555 010 0001', 'Home', true),
      point('b', '555 010 0002', 'Work', true),
    ]),
  ),
  ['a'],
  'two marked: the first marked stays primary',
);
assert.deepEqual(toContactPoints('phone', 'nonsense'), []);
assert.deepEqual(
  toContactPoints('phone', [{ id: 1, value: 'x' }, null, 'y']),
  [],
  'unreadable entries are dropped',
);

// The first added is primary; the next is not; make primary moves it.
const first = unwrap(
  addContactPoint('phone', [], {
    id: 'a',
    value: '415 555 0142',
    label: 'Mobile',
  }),
);
assert.deepEqual(primaries(first), ['a']);
const second = unwrap(
  addContactPoint('phone', first, {
    id: 'b',
    value: '415 555 0188',
    label: 'Work',
  }),
);
assert.deepEqual(primaries(second), ['a']);
assert.deepEqual(primaries(makePrimaryContactPoint(second, 'b')), ['b']);

// Removing the primary makes the next one primary; removing the only one leaves none.
const afterRemove = removeContactPoint(second, 'a');
assert.deepEqual(
  afterRemove.map((entry) => [entry.id, entry.isPrimary]),
  [['b', true]],
);
assert.deepEqual(removeContactPoint(afterRemove, 'b'), []);
assert.deepEqual(
  primaries(removeContactPoint(second, 'b')),
  ['a'],
  'removing a non-primary keeps the primary',
);

// The same digits twice are refused, however they are typed; an email repeats by case.
assert.equal(
  addContactPoint('phone', first, {
    id: 'c',
    value: '+1 (415) 555-0142',
    label: 'Home',
  }),
  'duplicate',
);
assert.equal(
  addContactPoint(
    'email',
    unwrap(
      addContactPoint('email', [], {
        id: 'e',
        value: 'Dana@Example.com',
        label: '',
      }),
    ),
    {
      id: 'f',
      value: 'dana@example.com',
      label: '',
    },
  ),
  'duplicate',
);
assert.equal(
  toContactKey('phone', '415.555.0142'),
  toContactKey('phone', '+1 415 555 0142'),
);
assert.equal(
  addContactPoint('phone', [], { id: 'x', value: '   ', label: '' }),
  'empty',
);
assert.equal(
  addContactPoint('phone', [], { id: 'x', value: 'call me', label: '' }),
  'empty',
);
assert.equal(
  changeContactPoint('phone', second, 'b', {
    value: '415-555-0142',
    label: 'Work',
  }),
  'duplicate',
  'a change to another entry’s number is refused',
);
assert.deepEqual(
  unwrap(
    changeContactPoint('phone', second, 'b', {
      value: '415 555 0188',
      label: 'Home',
    }),
  ).find((entry) => entry.id === 'b')?.label,
  'Home',
  'changing only the label keeps the number',
);

// Labels: the four as listed, the person's own word cut to 20, Other when empty.
assert.equal(toContactLabel('work'), 'Work');
assert.equal(toContactLabel('  MOBILE '), 'Mobile');
assert.equal(toContactLabel(''), 'Other');
assert.equal(toContactLabel(undefined), 'Other');
assert.equal(
  toContactLabel('Dana’s second line, the one by the fire'),
  'Dana’s second line,',
);
assert.ok(toContactLabel('x'.repeat(60)).length <= CONTACT_LABEL_CAP);
assert.equal(
  unwrap(
    addContactPoint('phone', [], {
      id: 'a',
      value: '415 555 0142',
      label: 'abcdefghij'.repeat(5),
    }),
  )[0]?.label.length,
  CONTACT_LABEL_CAP,
);

// At most 10 of a kind.
const ten = Array.from({ length: MAX_CONTACT_POINTS }, (_, index) =>
  point(`p${index}`, `415 555 01${String(index).padStart(2, '0')}`),
);
assert.equal(MAX_CONTACT_POINTS, 10);
assert.equal(
  addContactPoint('phone', toContactPoints('phone', ten), {
    id: 'eleven',
    value: '415 555 0199',
    label: '',
  }),
  'full',
);
assert.equal(
  toContactPoints('phone', [
    ...ten,
    point('p10', '415 555 0210'),
    point('p11', '415 555 0211'),
  ]).length,
  10,
  'a stored list longer than the cap is cut',
);

// "text Dana" is the primary, "Dana's work email" the labelled one.
assert.equal(pickContactPoint(second, null)?.id, 'a');
assert.equal(pickContactPoint(second, 'work')?.id, 'b');
assert.equal(
  pickContactPoint(second, 'cabin')?.id,
  'a',
  'an unknown label falls back to the primary',
);

// A typed "Dana's work number is 555-0142" becomes one labelled phone, with Undo from the effect.
const seal = (fields: Record<string, unknown>) => ({
  nonce: 'n',
  ciphertext: JSON.stringify(fields),
  keyId: 'k',
  keyVersion: 1,
});
const said = (extra: Partial<AddContactPointCommand> = {}) =>
  ({
    kind: 'addContactPoint',
    whoId: 'w1',
    contactKind: 'phone',
    value: '555-0142',
    label: 'Work',
    ...extra,
  }) as AddContactPointCommand;
let counter = 0;
const plan = (
  commands: AddContactPointCommand[],
  opened: Record<string, unknown>,
  skip: string[] = [],
) =>
  planContactPoints({
    commands,
    whos: new Map([['w1', opened]]),
    skipWhoIds: new Set(skip),
    newId: () => `id-${(counter += 1)}`,
    now: 1,
    isUnattended: false,
    seal: seal as never,
  });
const sealedOf = (result: ReturnType<typeof plan>) =>
  JSON.parse(
    (result.whoRewrites[0]?.data.sealed as { ciphertext: string }).ciphertext,
  ) as Record<string, unknown>;

const added = plan([said()], {
  name: 'Dana',
  phone: '415 555 0100',
  email: null,
});
const addedSealed = sealedOf(added);
assert.deepEqual(
  (addedSealed.phones as ContactPoint[]).map((entry) => [
    entry.value,
    entry.label,
    entry.isPrimary,
  ]),
  [
    ['415 555 0100', 'Other', true],
    ['555-0142', 'Work', false],
  ],
  'the old single phone becomes the primary and the new number is added beside it',
);
assert.equal(addedSealed.phone, null);
assert.deepEqual(added.lines, ['Added Dana’s work phone number']);
assert.equal(added.effects[0]?.previous?.['sealed.phone'], '415 555 0100');
assert.equal(added.effects[0]?.previous?.['sealed.phones'], null);
assert.equal(added.effects[0]?.written?.['sealed.phone'], null);
assert.deepEqual(added.effectRefs, [
  { op: 'update', collection: 'who', docId: 'w1' },
]);

const repeated = plan([said({ value: '(415) 555 0100' })], {
  name: 'Dana',
  phone: '415 555 0100',
});
assert.equal(
  repeated.whoRewrites.length,
  0,
  'a number the person already has is not added',
);
assert.deepEqual(repeated.notKept, ['Dana already has that number']);

const email = plan(
  [said({ contactKind: 'email', value: 'dana@work.example.com', label: null })],
  { name: 'Dana', phones: [], emails: [] },
);
assert.deepEqual(
  (sealedOf(email).emails as ContactPoint[]).map((entry) => [
    entry.label,
    entry.isPrimary,
  ]),
  [['Other', true]],
  'a first address with no word said is primary and labelled Other',
);
assert.deepEqual(email.lines, ['Added an email address for Dana']);
assert.equal(
  plan([said()], { name: 'Dana' }, ['w1']).whoRewrites.length,
  0,
  'a person already rewritten by another part of the turn is left for the next message',
);
assert.equal(plan([said()], { name: 'Dana' }, ['w1']).notKept.length, 1);

// The reply normalizer keeps a command only for a person in <people>, with a real number or address.
const people = createAliasBook('w');
const alias = people.add('who-1');
const reply = (item: Record<string, unknown>) =>
  normalizeNomosReply(
    {
      commands: [
        {
          kind: 'addContactPoint',
          whoAlias: alias,
          contactKind: 'phone',
          contactValue: '555-0142',
          contactLabel: 'work',
          ...item,
        },
      ],
    },
    {
      tasks: [],
      people,
      reading: { dates: [], people: [], places: [], tags: [], urgent: [] },
      captureText: 'Dana’s work number is 555-0142',
      timeZone: 'America/Los_Angeles',
      now: 1,
    } as never,
  );
const normalized = reply({}).contactPoints;
assert.deepEqual(normalized, [
  {
    kind: 'addContactPoint',
    whoId: 'who-1',
    contactKind: 'phone',
    value: '555-0142',
    label: 'Work',
  },
]);
assert.equal(
  reply({ whoAlias: 'w99' }).contactPoints.length,
  0,
  'an unknown person is dropped',
);
assert.equal(
  reply({ contactValue: 'call her' }).contactPoints.length,
  0,
  'a value with no digits is dropped',
);
assert.equal(reply({ contactKind: 'fax' }).contactPoints.length, 0);

// Dialling: an extension is a pause then its digits, never glued onto the number; a mailto address is escaped.
assert.equal(toDialableNumber('(415) 555-0142'), '4155550142');
assert.equal(toDialableNumber('+1 415 555 0142 ext 204'), '+14155550142,204');
assert.equal(toDialableNumber('415-555-0142 x12'), '4155550142,12');
assert.equal(toDialableNumber('415 555 0142,7'), '4155550142,7');
assert.equal(
  toMailtoUrl('a+b@example.com?x=1'),
  'mailto:a%2Bb@example.com%3Fx%3D1',
);
assert.equal(toMailtoUrl('a@x.com, b@x.com'), 'mailto:a@x.com,%20b@x.com');
assert.equal(toDialableNumber('555.123.4567 ext. 9'), '5551234567,9');
assert.equal(toDialableNumber('Box 5'), '5');
assert.equal(toDialableNumber('Max 555-1234'), '5551234');
assert.equal(toDialableNumber(''), '');
assert.deepEqual([...contactLabelsFor('email')], ['Home', 'Work', 'Other']);
assert.deepEqual([...contactLabelsFor('phone')], ['Mobile', 'Home', 'Work', 'Other']);
assert.equal(toTextableNumber('(415) 555-0177 ext 204'), '4155550177');

// A primary asked for with an id the list lost leaves it as it was, one primary kept.
const held = [point('a', 'a@x.com', 'Home', true), point('b', 'b@x.com')];
assert.deepEqual(makePrimaryContactPoint(held, 'gone'), held);

// Undo puts a removed entry back at its old place, and a primary stays primary.
const three = [
  point('a', 'a@x.com', 'Home', true),
  point('b', 'b@x.com'),
  point('c', 'c@x.com'),
];
const restored = restoreContactPoint(
  'email',
  removeContactPoint(three, 'b'),
  three[1] as ContactPoint,
  1,
);
assert.deepEqual(
  (restored as { points: ContactPoint[] }).points.map((entry) => entry.id),
  ['a', 'b', 'c'],
);
assert.equal(
  restoreContactPoint('email', three, point('z', 'B@X.com'), 0),
  'duplicate',
  'a restore is refused like an add',
);

// The edit sheet sends a difference, applied to a fresh list so another device's entry survives.
const loaded = [point('a', 'a@x.com', 'Home', true), point('b', 'b@x.com')];
const edited = [
  point('a', 'a@x.com', 'Work', false),
  point('c', 'c@x.com', 'Home', true),
];
const diff = diffContactPoints(loaded, edited);
assert.deepEqual(
  [diff.added.map((e) => e.id), diff.changed.map((e) => e.id), diff.removedIds],
  [['c'], ['a'], ['b']],
);
const fresh = [...loaded, point('d', 'd@x.com')];
const applied = applyContactDiff('email', fresh, diff) as {
  points: ContactPoint[];
};
assert.deepEqual(
  applied.points.map((entry) => entry.id),
  ['a', 'd', 'c'],
  'an entry added elsewhere meanwhile is kept',
);
assert.deepEqual(primaries(applied.points), ['c']);
assert.equal(
  applyContactDiff('email', [...fresh, point('e', 'c@x.com')], diff),
  'duplicate',
  'the duplicate check runs on the fresh list',
);

// An entry with no id is kept under a made one.
assert.deepEqual(
  toContactPoints('phone', [{ value: '415 555 0100', label: 'Work' }]).map(
    (entry) => entry.id,
  ),
  ['legacy-phone-0'],
);

// A phone from the model needs 7 digits.
const shortPhone = plan([said({ value: '555-01' })], {
  name: 'Dana',
  phone: null,
  email: null,
});
assert.equal(shortPhone.whoRewrites.length, 0, 'a short number writes nothing');
assert.equal(shortPhone.notKept.length, 1, 'a short number is a notKept line');

console.log('Helm who contacts: all checks passed');
