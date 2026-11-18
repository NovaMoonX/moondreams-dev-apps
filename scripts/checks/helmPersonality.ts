// How the assistant talks: the closed set, the clashes, reading a stored personality, the words it is told, saying a change and the preview's reuse: `npm run check:helm-personality`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { SealedPayload } from '../../functions/src/appKeys/seal.ts';
import {
  MAX_PERSONALITY_PER_TURN,
  type SetPersonalityCommand,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  DEFAULT_PERSONALITY,
  FIXED_SAMPLES,
  HONESTY_LABELS,
  HONESTY_LEVELS,
  HONESTY_PROMPT_LINES,
  KEEP_BOTH_LINES,
  MAX_TRAITS,
  PERSONALITY_TRAITS,
  PREVIEW_PROMPTS,
  TONE_TRAITS,
  TRAIT_CLASHES,
  TRAIT_LABELS,
  TRAIT_PROMPT_LINES,
  clashKey,
  describePersonalityChange,
  findOpenClashes,
  findTraitClashes,
  personalityHash,
  readPersonality,
  toPersonalityPrompt,
  type Personality,
  type PersonalityTrait,
} from '../../functions/src/apps/helm/nomos/personality.ts';
import {
  buildClashQuestion,
  buildOverCapLine,
  planPersonality,
  planResolvePersonality,
  buildNoProfileLine,
  buildProfileTakenLine,
} from '../../functions/src/apps/helm/nomos/planPersonality.ts';
import {
  PREVIEW_REPLY_CAP,
  buildFixturePreview,
  cleanPreviewReply,
  readPreviewReplies,
  reusePreview,
} from '../../functions/src/apps/helm/nomos/personalityPreview.ts';
import { readPersonalityCommands } from '../../functions/src/apps/helm/nomos/readPersonalityCommands.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const personality = (
  traits: PersonalityTrait[],
  keptClashes: string[] = [],
): Personality => ({ traits, honesty: 'straight', keptClashes });

const NOW = Date.UTC(2026, 10, 9, 17, 0);

test('every clash pair is found in either order and has a keep-both line', () => {
  assert.equal(TRAIT_CLASHES.length, Object.keys(KEEP_BOTH_LINES).length);
  TRAIT_CLASHES.forEach(([left, right]) => {
    const key = clashKey(left, right);
    assert.equal(clashKey(right, left), key);
    [
      [left, right],
      [right, left],
    ].forEach((traits) => {
      const found = findTraitClashes(traits as PersonalityTrait[]);
      assert.equal(found.length, 1, key);
      assert.equal(found[0].key, key);
    });
    assert.ok((KEEP_BOTH_LINES[key] ?? '').length > 0, `${key} has a line`);
  });
  assert.deepEqual(findTraitClashes(['honest', 'brief', 'warm']), []);
});

test('an open clash is one the person has not chosen to keep', () => {
  const both = personality(['blunt', 'gentle']);
  assert.equal(findOpenClashes(both).length, 1);
  assert.equal(
    findOpenClashes({ ...both, keptClashes: ['blunt+gentle'] }).length,
    0,
  );
});

test('a stored personality is read safely', () => {
  Object.entries(TONE_TRAITS).forEach(([tone, traits]) => {
    assert.deepEqual(readPersonality(null, tone).traits, traits, tone);
    assert.equal(readPersonality(undefined, tone).honesty, 'straight');
  });
  assert.deepEqual(readPersonality(null, 'loud'), DEFAULT_PERSONALITY);
  assert.deepEqual(readPersonality(null, null), DEFAULT_PERSONALITY);
  ['junk', 7, true].forEach((junk) => {
    assert.deepEqual(readPersonality(junk, 'formal').traits, ['formal']);
  });
  assert.deepEqual(readPersonality({ traits: 'blunt' }, 'formal').traits, []);
  const messy = readPersonality(
    {
      traits: [
        'blunt',
        'blunt',
        'sparkly',
        7,
        'gentle',
        'honest',
        'brief',
        'warm',
        'dry',
      ],
      honesty: 'loud',
      keptClashes: ['blunt+gentle', 'blunt+gentle', 'brief+detailed', 3],
    },
    null,
  );
  assert.deepEqual(messy.traits, [
    'blunt',
    'gentle',
    'honest',
    'brief',
    'warm',
  ]);
  assert.equal(messy.traits.length, MAX_TRAITS);
  assert.equal(messy.honesty, 'straight');
  assert.deepEqual(messy.keptClashes, ['blunt+gentle']);
  assert.deepEqual(
    readPersonality(
      { traits: ['blunt'], honesty: 'tactful', keptClashes: ['blunt+gentle'] },
      null,
    ).keptClashes,
    [],
  );
  assert.equal(
    readPersonality({ traits: [], honesty: 'unvarnished' }, null).honesty,
    'unvarnished',
  );
});

test('the hash ignores order and tells a different personality apart', () => {
  assert.equal(
    personalityHash(personality(['honest', 'brief', 'warm'])),
    personalityHash(personality(['warm', 'honest', 'brief'])),
  );
  assert.notEqual(
    personalityHash(personality(['honest'])),
    personalityHash({ ...personality(['honest']), honesty: 'tactful' }),
  );
  assert.notEqual(
    personalityHash(personality(['blunt', 'gentle'])),
    personalityHash(personality(['blunt', 'gentle'], ['blunt+gentle'])),
  );
});

const CHEER = /amazing|awesome|great job|you got this|so proud/i;
const EMOJI = /\p{Extended_Pictographic}/u;

test('no trait, honesty or kept-pair line and no sample cheers, shouts or uses an emoji', () => {
  const words = [
    ...Object.values(TRAIT_PROMPT_LINES),
    ...Object.values(HONESTY_PROMPT_LINES),
    ...Object.values(HONESTY_LABELS),
    ...Object.values(TRAIT_LABELS),
    ...Object.values(KEEP_BOTH_LINES),
    ...Object.values(FIXED_SAMPLES),
    ...PREVIEW_PROMPTS.map((prompt) => prompt),
  ];
  assert.equal(Object.keys(FIXED_SAMPLES).length, PERSONALITY_TRAITS.length);
  assert.equal(
    Object.keys(TRAIT_PROMPT_LINES).length,
    PERSONALITY_TRAITS.length,
  );
  assert.equal(Object.keys(HONESTY_PROMPT_LINES).length, HONESTY_LEVELS.length);
  words.forEach((line) => {
    assert.ok(!line.includes('!'), line);
    assert.ok(!EMOJI.test(line), line);
    assert.ok(!CHEER.test(line), line);
  });
});

test('the prompt holds each trait line, the honesty line and the kept pairs', () => {
  const prompt = toPersonalityPrompt({
    traits: ['blunt', 'gentle'],
    honesty: 'unvarnished',
    keptClashes: ['blunt+gentle'],
  });
  assert.ok(prompt.includes(TRAIT_PROMPT_LINES.blunt));
  assert.ok(prompt.includes(TRAIT_PROMPT_LINES.gentle));
  assert.ok(prompt.includes(HONESTY_PROMPT_LINES.unvarnished));
  assert.ok(prompt.includes(KEEP_BOTH_LINES['blunt+gentle']));
  assert.ok(prompt.includes('health and care stay careful'));
  assert.ok(
    !toPersonalityPrompt(DEFAULT_PERSONALITY).includes(
      KEEP_BOTH_LINES['blunt+gentle'],
    ),
  );
});

const asked = (quote: string, fields: Record<string, unknown> = {}) => ({
  kind: 'setPersonality',
  requestQuote: quote,
  addTraits: null,
  removeTraits: null,
  honesty: null,
  ...fields,
});

test('a quote that was said but asks nothing about talking changes nothing', () => {
  ['never mind', "I'm home", 'forget it'].forEach((quote) =>
    assert.deepEqual(
      readPersonalityCommands([asked(quote, { honesty: 'unvarnished' })], {
        captureText: `${quote}, thanks`,
      }),
      { commands: [], dropped: ['personality-unasked'] },
    ),
  );
  assert.equal(
    readPersonalityCommands(
      [asked('stop sugarcoating things', { honesty: 'unvarnished' })],
      { captureText: 'stop sugarcoating things' },
    ).commands.length,
    1,
  );
  [
    'get to the point',
    'be more professional',
    'be more fun',
    'lighten up',
    'be more upbeat',
    'be more supportive',
    'be less sarcastic',
    'stop lecturing me',
    'use fewer emojis',
    'be more laid back',
    'cut the fluff',
    'be less drier',
  ].forEach((quote) =>
    assert.equal(
      readPersonalityCommands([asked(quote, { honesty: 'tactful' })], {
        captureText: quote,
      }).commands.length,
      1,
      quote,
    ),
  );
});

test('setPersonality is read only from the closed set and only when asked', () => {
  const read = readPersonalityCommands(
    [
      asked('be more blunt with me', {
        addTraits: ['blunt', 'sparkly', 'blunt'],
        honesty: 'loud',
      }),
    ],
    { captureText: 'Please be more blunt with me.' },
  );
  assert.deepEqual(read.commands, [
    {
      kind: 'setPersonality',
      addTraits: ['blunt'],
      removeTraits: [],
      honesty: null,
    },
  ]);
  assert.deepEqual(read.dropped, []);
  assert.equal(
    readPersonalityCommands(
      [asked('stop being so formal', { removeTraits: ['formal'] })],
      { captureText: 'stop being so formal' },
    ).commands[0].removeTraits[0],
    'formal',
  );
  assert.equal(
    readPersonalityCommands(
      [asked('be more honest with me', { honesty: 'unvarnished' })],
      {
        captureText: 'be more honest with me',
      },
    ).commands[0].honesty,
    'unvarnished',
  );
  assert.deepEqual(
    readPersonalityCommands(
      [asked('be more blunt', { addTraits: ['blunt'] })],
      {
        captureText: 'what is on my list',
      },
    ),
    { commands: [], dropped: ['personality-unasked'] },
  );
  assert.deepEqual(
    readPersonalityCommands(
      [{ kind: 'setPersonality', addTraits: ['blunt'] }],
      {
        captureText: 'be blunt',
      },
    ).dropped,
    ['personality-unasked'],
  );
  assert.deepEqual(
    readPersonalityCommands([asked('be nicer', { addTraits: ['sparkly'] })], {
      captureText: 'be nicer',
    }).dropped,
    ['personality-empty'],
  );
  const two = readPersonalityCommands(
    [
      asked('be blunt', { addTraits: ['blunt'] }),
      asked('be dry', { addTraits: ['dry'] }),
    ],
    { captureText: 'be blunt and be dry' },
  );
  assert.equal(two.commands.length, MAX_PERSONALITY_PER_TURN);
  assert.deepEqual(two.dropped, ['personality-extra']);
});

test('an addition the cap would leave out is a drop code', () => {
  const full = personality(['honest', 'brief', 'warm', 'detailed', 'dry']);
  assert.deepEqual(
    readPersonalityCommands([asked('be blunt', { addTraits: ['blunt'] })], {
      captureText: 'be blunt',
      current: full,
    }).dropped,
    ['personality-cap'],
  );
  assert.deepEqual(
    readPersonalityCommands(
      [asked('be blunt', { addTraits: ['blunt'], removeTraits: ['dry'] })],
      { captureText: 'be blunt', current: full },
    ).dropped,
    [],
  );
});

const command = (
  fields: Partial<SetPersonalityCommand>,
): SetPersonalityCommand => ({
  kind: 'setPersonality',
  addTraits: [],
  removeTraits: [],
  honesty: null,
  ...fields,
});

const plan = (
  fields: Partial<SetPersonalityCommand>,
  stored: unknown = null,
  extra: {
    legacyTone?: unknown;
    isUnattended?: boolean;
    room?: number;
    isProfileTaken?: boolean;
    hasProfile?: boolean;
  } = {},
) =>
  planPersonality({
    command: command(fields),
    stored,
    legacyTone: extra.legacyTone ?? null,
    storedSetAt: null,
    profileId: 'uid-1',
    assistantName: 'Juniper',
    now: NOW,
    isUnattended: extra.isUnattended ?? false,
    newId: () => 'q1',
    room: extra.room ?? 10,
    isProfileTaken: extra.isProfileTaken ?? false,
    hasProfile: extra.hasProfile ?? true,
  });

test('a turn that already writes the profile ("I\'m home") leaves how it talks for its own turn', () => {
  const result = plan({ addTraits: ['blunt'] }, null, { isProfileTaken: true });
  assert.equal(result.data, null);
  assert.equal(result.effects.length, 0);
  assert.deepEqual(result.notKept, [buildProfileTakenLine('Juniper')]);
});

test('a turn for a person with no profile yet writes nothing and says so', () => {
  const result = plan({ addTraits: ['blunt'] }, null, { hasProfile: false });
  assert.equal(result.data, null);
  assert.deepEqual(result.notKept, [buildNoProfileLine('Juniper')]);
});

test('"be more blunt with me" writes the profile field with a way back', () => {
  const result = plan({ addTraits: ['blunt'] });
  assert.deepEqual(result.data?.personality.traits, [
    'honest',
    'brief',
    'warm',
    'blunt',
  ]);
  assert.equal(result.data?.personalitySetAt, NOW);
  assert.deepEqual(result.effectRefs, [
    { op: 'update', collection: 'profile', docId: 'uid-1' },
  ]);
  assert.equal(result.effects[0].written['sealed.title'], 'How Juniper talks');
  assert.equal(
    result.effects[0].written['sealed.detail'],
    'Blunt added · Honest, Brief, Warm, Blunt',
  );
  assert.equal(result.effects[0].previous?.personality, null);
  assert.equal(result.effects[0].previous?.personalitySetAt, null);
  assert.deepEqual(result.lines, ['Blunt added · Honest, Brief, Warm, Blunt']);
  assert.deepEqual(result.questions, []);
});

test('an old tone is the starting point and the stored value is what Undo puts back', () => {
  const result = plan({ addTraits: ['dry'] }, null, { legacyTone: 'formal' });
  assert.deepEqual(result.data?.personality.traits, ['formal', 'dry']);
  const stored = personality(['honest'], []);
  assert.deepEqual(
    plan({ addTraits: ['dry'] }, stored).effects[0].previous?.personality,
    stored,
  );
});

test('removing a trait and setting honesty are written', () => {
  const removed = plan({ removeTraits: ['warm'] });
  assert.deepEqual(removed.data?.personality.traits, ['honest', 'brief']);
  assert.equal(removed.lines[0], 'Warm removed · Honest, Brief');
  const honest = plan({ honesty: 'unvarnished' });
  assert.equal(honest.data?.personality.honesty, 'unvarnished');
  assert.equal(honest.lines[0], 'Holds nothing back · Honest, Brief, Warm');
});

test("the result never passes five traits: an addition over the cap is left out and said in code's words", () => {
  const full = personality(['honest', 'brief', 'warm', 'detailed', 'dry']);
  const none = plan({ addTraits: ['blunt'] }, full);
  assert.equal(none.data, null);
  assert.deepEqual(none.effects, []);
  assert.deepEqual(none.notKept, [buildOverCapLine(['blunt'])]);
  const some = plan(
    { addTraits: ['blunt', 'casual'] },
    personality(['honest', 'brief', 'warm', 'detailed']),
  );
  assert.equal(some.data?.personality.traits.length, MAX_TRAITS);
  assert.deepEqual(some.notKept, [buildOverCapLine(['casual'])]);
  const swapped = plan({ addTraits: ['blunt'], removeTraits: ['dry'] }, full);
  assert.deepEqual(swapped.data?.personality.traits, [
    'honest',
    'brief',
    'warm',
    'detailed',
    'blunt',
  ]);
});

test('nothing changes when it already is that way, or there is no room', () => {
  assert.deepEqual(plan({ addTraits: ['warm'] }).effects, []);
  assert.deepEqual(plan({ addTraits: ['warm'] }).notKept, [
    "That's already how Juniper talks",
  ]);
  assert.equal(plan({ addTraits: ['blunt'] }, null, { room: 0 }).data, null);
});

test('a new clash is asked as one question with Keep both, Drop gentle and Drop blunt', () => {
  const result = plan(
    { addTraits: ['blunt'] },
    personality(['honest', 'gentle']),
  );
  assert.equal(result.questions.length, 1);
  const question = result.questions[0];
  assert.equal(question.state.kind, 'clashChoice');
  assert.equal(question.state.shape, 'pickOne');
  assert.equal(
    question.sealed.prompt,
    'Blunt and gentle pull against each other. Keep both?',
  );
  const options = question.sealed.options as {
    id: string;
    label: string;
    detail: string | null;
  }[];
  assert.deepEqual(
    options.map((option) => option.label),
    ['Keep both', 'Drop gentle', 'Drop blunt'],
  );
  assert.equal(options[0].detail, KEEP_BOTH_LINES['blunt+gentle']);
  assert.deepEqual(question.sealed.heldCommands, [
    { kind: 'clashChoice', left: 'blunt', right: 'gentle' },
  ]);
  assert.deepEqual(
    buildClashQuestion('blunt', 'gentle').options.map((option) => option.id),
    ['keep', 'drop-gentle', 'drop-blunt'],
  );
});

test('a clash already open or already kept is not asked again, and an outside turn is never asked', () => {
  assert.deepEqual(
    plan({ addTraits: ['dry'] }, personality(['blunt', 'gentle'])).questions,
    [],
  );
  assert.deepEqual(
    plan({ addTraits: ['blunt'] }, personality(['gentle']), {
      isUnattended: true,
    }).questions,
    [],
  );
  assert.deepEqual(
    plan(
      { addTraits: ['casual'] },
      personality(['blunt', 'gentle', 'dry'], ['blunt+gentle']),
    ).questions,
    [],
  );
});

const askedCapture = () => ({
  opened: {
    questions: {
      q1: {
        heldCommands: [{ kind: 'clashChoice', left: 'blunt', right: 'gentle' }],
      },
    },
  } as Record<string, unknown>,
  capture: {
    status: 'needsYou',
    executionIds: [] as string[],
    questionState: {
      q1: {
        kind: 'clashChoice',
        shape: 'pickOne',
        askedAt: NOW,
        answeredAt: null as number | null,
        skippedAt: null,
        dismissedAt: null,
      },
    },
  },
});

const resolve = (optionId: string, stored: unknown, held = askedCapture()) =>
  planResolvePersonality({
    captureId: 'c1',
    questionId: 'q1',
    optionId,
    by: 'voice',
    now: NOW,
    executionId: 'e1',
    stored,
    legacyTone: null,
    storedSetAt: null,
    profileId: 'uid-1',
    assistantName: 'Juniper',
    seal: (fields) => fields as unknown as SealedPayload,
    ...held,
  });

test('answering the clash keeps both or drops one, as its own execution', () => {
  const stored = personality(['honest', 'blunt', 'gentle']);
  const kept = resolve('keep', stored);
  assert.equal(kept.refused, null);
  if (kept.refused !== null) return;
  assert.deepEqual(kept.data?.personality.keptClashes, ['blunt+gentle']);
  assert.deepEqual(kept.data?.personality.traits, [
    'honest',
    'blunt',
    'gentle',
  ]);
  assert.equal(kept.execution?.state, 'succeeded');
  assert.deepEqual(kept.execution?.effectRefs, [
    { op: 'update', collection: 'profile', docId: 'uid-1' },
  ]);
  assert.deepEqual(kept.capture.executionIds, ['e1']);
  assert.equal(kept.capture.status, 'sorted');
  const dropped = resolve('drop-gentle', stored);
  if (dropped.refused !== null) throw new Error('refused');
  assert.deepEqual(dropped.data?.personality.traits, ['honest', 'blunt']);
  assert.equal(
    describePersonalityChange(stored, dropped.data!.personality),
    'Gentle removed · Honest, Blunt',
  );
  const other = resolve('drop-blunt', stored);
  if (other.refused !== null) throw new Error('refused');
  assert.deepEqual(other.data?.personality.traits, ['honest', 'gentle']);
});

test('a clash settled elsewhere writes nothing, and a bad or repeated answer is refused', () => {
  const settled = resolve(
    'keep',
    personality(['honest', 'blunt', 'gentle'], ['blunt+gentle']),
  );
  assert.equal(settled.refused, null);
  if (settled.refused === null) {
    assert.equal(settled.data, null);
    assert.equal(settled.execution, null);
  }
  const gone = resolve('drop-gentle', personality(['honest']));
  assert.equal(gone.refused === null && gone.data, null);
  assert.deepEqual(resolve('drop-casual', personality(['blunt', 'gentle'])), {
    refused: 'unknown',
  });
  const answered = askedCapture();
  answered.capture.questionState.q1.answeredAt = NOW;
  assert.deepEqual(
    resolve('keep', personality(['blunt', 'gentle']), answered),
    {
      refused: 'answered',
    },
  );
});

test('a preview made for this very personality is reused, in any order', () => {
  const replies = ['One.', 'Two.'];
  const stored = {
    hash: personalityHash(personality(['honest', 'warm'])),
    replies,
    at: NOW,
  };
  assert.deepEqual(
    reusePreview(stored, personality(['warm', 'honest'])),
    replies,
  );
  assert.equal(reusePreview(stored, personality(['honest'])), null);
  assert.equal(reusePreview(null, personality(['honest'])), null);
  assert.equal(
    reusePreview(
      { ...stored, replies: ['One.'] },
      personality(['honest', 'warm']),
    ),
    null,
  );
});

test('preview replies are cleaned by code and read only when every one is there', () => {
  assert.equal(
    cleanPreviewReply('Sure thing! 😀 Play ten minutes!'),
    'Sure thing. Play ten minutes.',
  );
  assert.ok(cleanPreviewReply('word '.repeat(100)).length <= PREVIEW_REPLY_CAP);
  assert.ok(!/[!]/.test(cleanPreviewReply('Wow!!! ok?!')));
  assert.equal(
    readPreviewReplies(['Yes.', 'No.'])?.length,
    PREVIEW_PROMPTS.length,
  );
  assert.equal(readPreviewReplies(['Yes.']), null);
  assert.equal(readPreviewReplies(['Yes.', '😀']), null);
  assert.equal(readPreviewReplies('nope'), null);
  const fixture = buildFixturePreview(personality(['dry', 'warm']));
  assert.equal(fixture[0], FIXED_SAMPLES.dry);
  assert.equal(readPreviewReplies(fixture)?.length, PREVIEW_PROMPTS.length);
});

test('the callable looks for stored replies before it asks a model, and counts on the quick route', () => {
  const source = readFileSync(
    'functions/src/apps/helm/previewHelmPersonality.ts',
    'utf8',
  );
  assert.ok(source.indexOf('reusePreview(') < source.indexOf('askTopicModel('));
  assert.ok(
    source.includes("reserveAiCall(firestore, uid, Date.now(), 'quick')"),
  );
  assert.ok(source.includes('readPersonality('));
});

let failed = 0;
for (const [name, run] of tests) {
  try {
    run();
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n`, error);
  }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
