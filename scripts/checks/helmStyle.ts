import assert from 'node:assert/strict';

import {
  MAX_AVOID_CHARS,
  MAX_STYLE_AVOID,
  MAX_STYLE_TRAITS,
  MAX_TRAIT_CHARS,
  createStyleFixtureProvider,
  mergeLearned,
  mergeStyle,
  toMailBatches,
  toMailGroups,
  toMailOccasion,
  readStyleReply,
  toStyleNotes,
  type StyleWords,
} from '../../functions/src/apps/helm/styleLearner.ts';
import {
  readAddresses,
  toWrittenText,
} from '../../functions/src/connections/google/mailText.ts';
import { buildContext } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import type { CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';

const line = (text: string, exampleCount: number) => ({ text, exampleCount });
const trait = (text: string, isPersonSet: boolean, exampleCount: number) => ({
  text,
  isPersonSet,
  exampleCount,
});

const SAMPLES = Array.from({ length: 12 }, (_, index) =>
  index % 2 === 0
    ? `remind me to call the plumber about the leaking kitchen tap number ${index}`
    : `Add milk to the list ${index}. Cheers`,
);

// Merge: a person-set trait is never replaced or removed, a learned one goes when it drops below 3.
const existing: StyleWords = {
  label: 'General',
  traits: {
    mine: trait('Warm but brief', true, 0),
    old: trait('Long sentences', false, 9),
    stays: trait('Short sentences', false, 9),
  },
  avoid: ['No emoji'],
  removed: [],
};
const merged = mergeStyle(
  existing,
  {
    traits: [
      line('Short sentences', 20),
      line('Signs off Cheers', 2),
      line('Warm but brief', 30),
      line('Plain words', 5),
    ],
    avoid: [line('No exclamation marks', 8), line('No puns', 1)],
  },
  false,
);
assert.deepEqual(merged.traits.mine, trait('Warm but brief', true, 0));
assert.equal(
  merged.traits.old,
  undefined,
  'a learned trait not seen again is replaced',
);
assert.equal(
  Object.values(merged.traits).find(
    (entry) => entry.text === 'Signs off Cheers',
  ),
  undefined,
  'a count below 3 goes',
);
assert.equal(
  Object.values(merged.traits).filter(
    (entry) => entry.text === 'Warm but brief',
  ).length,
  1,
  'a learned copy of a person-set trait is not added',
);
assert.equal(
  Object.values(merged.traits).find((entry) => entry.text === 'Short sentences')
    ?.exampleCount,
  20,
);
assert.deepEqual(merged.avoid, ['No exclamation marks']);
assert.deepEqual(
  mergeStyle(existing, { traits: [], avoid: [line('No puns', 4)] }, true).avoid,
  ['No emoji', 'No puns'],
  'an edited profile keeps its avoid lines',
);

// Merge: a note the person removed is not learned again, and the list is carried through.
const tombstoned = mergeStyle(
  {
    label: 'General',
    traits: {},
    avoid: [],
    removed: ['short sentences', 'no puns'],
  },
  {
    traits: [line('  Short   Sentences ', 9), line('Plain words', 9)],
    avoid: [line('No puns', 9), line('No emoji', 9)],
  },
  false,
);
assert.deepEqual(
  Object.values(tombstoned.traits).map((entry) => entry.text),
  ['Plain words'],
  'a removed trait is not learned again',
);
assert.deepEqual(tombstoned.avoid, ['No emoji'], 'a removed avoid line goes');
assert.deepEqual(tombstoned.removed, ['short sentences', 'no puns']);

// Merge: the cap is 12 with the person-set ones first.
const personTraits = Object.fromEntries(
  Array.from({ length: 4 }, (_, index) => [
    `p${index}`,
    trait(`Mine ${index}`, true, 0),
  ]),
);
const crowded = mergeStyle(
  { label: 'General', traits: personTraits, avoid: [], removed: [] },
  {
    traits: Array.from({ length: 12 }, (_, index) =>
      line(`Learned ${index}`, 20 - index),
    ),
    avoid: Array.from({ length: 9 }, (_, index) => line(`Avoid ${index}`, 5)),
  },
  false,
);
assert.equal(Object.keys(crowded.traits).length, MAX_STYLE_TRAITS);
assert.equal(
  Object.values(crowded.traits).filter((entry) => entry.isPersonSet).length,
  4,
);
assert.equal(crowded.avoid.length, MAX_STYLE_AVOID);
assert.equal(
  Object.keys(
    mergeStyle(null, { traits: [line('Short sentences', 5)], avoid: [] }, false)
      .traits,
  ).length,
  1,
);
assert.equal(
  mergeStyle(null, { traits: [], avoid: [] }, false).label,
  'General',
);

// Reply validation: caps, lengths, quotes and copied sentences.
const copied = 'remind me to call the plumber about the leaking kitchen tap';
const reply = readStyleReply(
  {
    traits: [
      line('Short sentences', 9),
      line('x'.repeat(MAX_TRAIT_CHARS + 1), 9),
      line("Signs off 'Cheers,'", 99),
      line(`Opens with "${'y'.repeat(31)}"`, 9),
      line(`Writes things like ${copied}`, 9),
      line('Short sentences', 4),
      line('', 5),
      ...Array.from({ length: 20 }, (_, index) => line(`Habit ${index}`, 6)),
    ],
    avoid: [
      line('No exclamation marks', 7),
      line('z'.repeat(MAX_AVOID_CHARS + 1), 7),
      ...Array.from({ length: 9 }, (_, index) => line(`Never ${index}`, 5)),
    ],
  },
  SAMPLES,
);
assert.ok(reply);
const texts = reply.traits.map((entry) => entry.text);
assert.equal(
  texts.filter((text) => text === 'Short sentences').length,
  1,
  'duplicates collapse',
);
assert.ok(!texts.some((text) => text.length > MAX_TRAIT_CHARS));
assert.ok(
  texts.includes("Signs off 'Cheers,'"),
  'a short quoted sign-off stays',
);
assert.ok(
  !texts.some((text) => text.startsWith('Opens with')),
  'a long quote goes',
);
assert.ok(
  !texts.some((text) => text.includes(copied)),
  'a sentence copied from the samples goes',
);
assert.equal(reply.traits.length, MAX_STYLE_TRAITS);
assert.equal(reply.avoid.length, MAX_STYLE_AVOID);
assert.ok(reply.avoid.every((entry) => entry.text.length <= MAX_AVOID_CHARS));
assert.equal(
  reply.traits.find((entry) => entry.text === "Signs off 'Cheers,'")
    ?.exampleCount,
  SAMPLES.length,
  'a count never passes the samples read',
);
const quoteReply = readStyleReply(
  {
    traits: [
      line("Calls everyone 'Dana'", 9),
      line("Doesn't use contractions like don't", 9),
      line('Ends with "Plain words"', 9),
    ],
    avoid: [],
  },
  [...SAMPLES, "Dana said it doesn't matter, don't worry"],
);
assert.deepEqual(
  quoteReply?.traits.map((entry) => entry.text),
  ["Doesn't use contractions like don't"],
  'a quote in one sample goes, an apostrophe inside a word is no quote',
);
assert.equal(readStyleReply(null, SAMPLES), null);
assert.equal(readStyleReply({ traits: 'x', avoid: [] }, SAMPLES), null);

// Nothing of the samples reaches what is stored or told to a free-writing turn.
const fixture = await createStyleFixtureProvider().runToolLoop({
  role: 'style',
  system: '',
  messages: [
    { role: 'user', content: `<samples>${JSON.stringify(SAMPLES)}</samples>` },
  ],
  mcpClient: {} as never,
  terminalTool: { name: 'x', description: '', inputSchema: {} },
  limits: { maxTurns: 1, maxToolCalls: 0, maxMillis: 1 },
});
const learned = readStyleReply(fixture.terminalInput, SAMPLES);
assert.ok(
  learned && learned.traits.length >= 3,
  'the emulator answers with a realistic set',
);
const stored = JSON.stringify(mergeStyle(null, learned, false));
SAMPLES.forEach((sample) =>
  assert.ok(!stored.includes(sample), 'a sample is stored'),
);
assert.ok(stored.length < 2_000);

const notes = toStyleNotes(mergeStyle(null, learned, false));
assert.ok(notes && notes.traits.length > 0 && notes.avoid.length > 0);
assert.equal(toStyleNotes(null), null);
assert.equal(
  toStyleNotes({ label: 'General', traits: {}, avoid: [], removed: [] }),
  null,
);

const reading: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  isUrgent: false,
  dates: [],
} as unknown as CaptureReading;
const base = {
  text: 'hello',
  reading,
  createdAt: Date.UTC(2026, 10, 11, 12),
  timeZone: 'UTC',
  tasks: [],
};
assert.ok(!buildContext(base).message.includes('<your_style>'));
assert.ok(
  !buildContext({ ...base, style: null }).message.includes('<your_style>'),
);
assert.ok(
  buildContext({ ...base, style: notes }).message.includes(
    `<your_style>${JSON.stringify(notes)}</your_style>`,
  ),
);

// Sent mail: quoted replies and signatures are never kept, and each text is cut to 1,500.
assert.equal(
  toWrittenText(
    'Hi Sam,\n\nSee you Friday.\n\nThanks,\nAlex\n\nOn Tue, Mar 4, 2025 at 9:12 AM Sam <s@example.com> wrote:\n> older words\n> more',
  ),
  'Hi Sam,\n\nSee you Friday.\n\nThanks,\nAlex',
);
assert.equal(
  toWrittenText('Sounds good.\n\n-- \nAlex Morgan\nHarbor Events'),
  'Sounds good.',
);
assert.equal(toWrittenText('Sounds good.\n--\nAlex'), 'Sounds good.');
assert.equal(
  toWrittenText(
    'On Tue, Mar 4, 2025 at 9:12 AM Sam Rivera\n<s@example.com> wrote:\n> hi\nreply',
  ),
  '',
  'a wrapped "wrote:" line still starts the quote',
);
assert.equal(toWrittenText('Yes\n> quoted line\nand no'), 'Yes\nand no');
assert.equal(toWrittenText('a'.repeat(2000)).length, 1500);
assert.deepEqual(
  readAddresses('Sam Rivera <Sam.Rivera@Example.com>, "Jo, B" <jo@gmail.com>'),
  ['sam.rivera@example.com', 'jo@gmail.com'],
);

// Sent mail: personal only when every recipient is on a personal provider.
assert.equal(toMailOccasion(['mom@gmail.com']), 'personal');
assert.equal(toMailOccasion(['mom@gmail.com', 'sam@acme.example']), 'work');
assert.equal(toMailOccasion(['a@acme.example']), 'work');
assert.equal(toMailOccasion([]), 'work');

const mail = (to: string[], text: string) => ({ to, text });
const sent = [
  ...Array.from({ length: 6 }, (_, i) => mail(['sam@acme.example'], `w${i}`)),
  ...Array.from({ length: 5 }, (_, i) => mail(['mom@gmail.com'], `p${i}`)),
  mail(['dana@acme.example'], 'x'),
];
const grouped = toMailGroups(
  sent,
  new Map([
    ['sam@acme.example', 'who-sam'],
    ['mom@gmail.com', 'who-mom'],
    ['dana@acme.example', 'who-dana'],
  ]),
);
assert.deepEqual(
  grouped.map((group) => [group.id, group.texts.length]),
  [
    ['mail-work', 7],
    ['mail-personal', 5],
    ['mail-who-who-sam', 6],
    ['mail-who-who-mom', 5],
  ],
  'a person with under 5 messages gets no audience; most written first',
);
assert.equal(grouped[2].audienceWhoId, 'who-sam');
const sevenWays = [
  ...Array.from({ length: 5 }, (_, i) => mail(['ops@acme.example'], `w${i}`)),
  ...Array.from({ length: 5 }, (_, i) => mail(['pal@gmail.com'], `p${i}`)),
  ...['a', 'b', 'c', 'd', 'e'].flatMap((who) =>
    Array.from({ length: 5 }, (_, i) =>
      mail([`${who}@acme.example`], `${who}${i}`),
    ),
  ),
];
const sevenGroups = toMailGroups(
  sevenWays,
  new Map(
    ['a', 'b', 'c', 'd', 'e'].map((who) => [
      `${who}@acme.example`,
      `who-${who}`,
    ]),
  ),
);
assert.equal(sevenGroups.length, 6, 'never more groups than batches');
assert.equal(toMailBatches(sevenGroups).length, sevenGroups.length);
assert.equal(grouped[0].scope, 'occasion');

// Sent mail: one batch per group when groups are many, never more than six in all, 50 a batch.
const many = (id: string, count: number) => ({
  id,
  scope: 'occasion' as const,
  audienceWhoId: null,
  texts: Array.from({ length: count }, (_, i) => `t${i}`),
});
const planned = toMailBatches([many('a', 120), many('b', 60), many('c', 8)]);
assert.deepEqual(
  planned.map((batches) => batches.map((batch) => batch.length)),
  [[50, 50, 20], [50, 10], [8]],
);
assert.equal(
  toMailBatches(Array.from({ length: 8 }, (_, i) => many(`g${i}`, 200))).flat()
    .length,
  6,
);

// Sent mail: batches' notes merge by summing counts per normalised text.
const mergedBatches = mergeLearned([
  { traits: [line('Short sentences', 4)], avoid: [line('No emoji', 3)] },
  {
    traits: [line('  short   Sentences ', 5), line('Signs off Thanks', 3)],
    avoid: [],
  },
]);
assert.deepEqual(mergedBatches.traits, [
  line('Short sentences', 9),
  line('Signs off Thanks', 3),
]);
assert.deepEqual(mergedBatches.avoid, [line('No emoji', 3)]);

console.log('helm style: ok');
