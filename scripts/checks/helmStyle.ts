import assert from 'node:assert/strict';

import {
  MAX_AVOID_CHARS,
  MAX_STYLE_AVOID,
  MAX_STYLE_TRAITS,
  MAX_TRAIT_CHARS,
  createStyleFixtureProvider,
  mergeStyle,
  readStyleReply,
  toStyleNotes,
  type StyleWords,
} from '../../functions/src/apps/helm/styleLearner.ts';
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
  merged.traits['signs-off-cheers'],
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
assert.equal(merged.traits['short-sentences'].exampleCount, 20);
assert.deepEqual(merged.avoid, ['No exclamation marks']);
assert.deepEqual(
  mergeStyle(existing, { traits: [], avoid: [line('No puns', 4)] }, true).avoid,
  ['No emoji', 'No puns'],
  'an edited profile keeps its avoid lines',
);

// Merge: the cap is 12 with the person-set ones first.
const personTraits = Object.fromEntries(
  Array.from({ length: 4 }, (_, index) => [
    `p${index}`,
    trait(`Mine ${index}`, true, 0),
  ]),
);
const crowded = mergeStyle(
  { label: 'General', traits: personTraits, avoid: [] },
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
assert.equal(toStyleNotes({ label: 'General', traits: {}, avoid: [] }), null);

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

console.log('helm style: ok');
