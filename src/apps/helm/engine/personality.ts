/** How the assistant talks: the closed set of traits, how honest it may be, the pairs that pull apart and what the model is told. Pure and import-free, shared by the device and the server (vendored). */

export const PERSONALITY_TRAITS = [
  'honest',
  'brief',
  'warm',
  'detailed',
  'dry',
  'blunt',
  'unvarnished',
  'gentle',
  'playful',
  'casual',
  'formal',
  'encouraging',
] as const;
export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

export const HONESTY_LEVELS = ['tactful', 'straight', 'unvarnished'] as const;
export type HonestyLevel = (typeof HONESTY_LEVELS)[number];

export const MAX_TRAITS = 5;

export interface Personality {
  traits: PersonalityTrait[];
  honesty: HonestyLevel;
  /** Clash pairs the person chose to keep both of, as `clashKey` values. */
  keptClashes: string[];
}

export const TRAIT_LABELS: Record<PersonalityTrait, string> = {
  honest: 'Honest',
  brief: 'Brief',
  warm: 'Warm',
  detailed: 'Detailed',
  dry: 'Dry',
  blunt: 'Blunt',
  unvarnished: 'Unvarnished',
  gentle: 'Gentle',
  playful: 'Playful',
  casual: 'Casual',
  formal: 'Formal',
  encouraging: 'Encouraging',
};

export const HONESTY_LABELS: Record<HonestyLevel, string> = {
  tactful: 'Softens hard news',
  straight: 'Says it plainly',
  unvarnished: 'Holds nothing back',
};

/** One line per trait for the model. None asks for cheer, emoji or exclamation marks. */
export const TRAIT_PROMPT_LINES: Record<PersonalityTrait, string> = {
  honest: 'Say what is true, including what the person may not want to hear.',
  brief: 'Use the fewest words that answer; fragments are fine.',
  warm: 'Sound kind and on their side, without gushing.',
  detailed: 'Give the reason and the next step, not only the answer.',
  dry: 'A light, understated wit is welcome; never at the person’s expense.',
  blunt: 'Lead with the point and skip the cushioning.',
  unvarnished: 'Do not soften facts or dress them up.',
  gentle: 'Choose soft words for anything hard.',
  playful: 'A little lightness is welcome where nothing is serious.',
  casual: 'Talk the way a friend would, in everyday words.',
  formal: 'Keep a measured, courteous register, never stiff or long.',
  encouraging: 'Name what still works and the next small step, without praise.',
};

export const HONESTY_PROMPT_LINES: Record<HonestyLevel, string> = {
  tactful: 'Soften hard news: lead with what can be done.',
  straight: 'Say hard news plainly, once, then what can be done.',
  unvarnished:
    'Say hard news as it is, with nothing held back, and never unkindly.',
};

export const TRAIT_CLASHES: readonly (readonly [
  PersonalityTrait,
  PersonalityTrait,
])[] = [
  ['blunt', 'gentle'],
  ['brief', 'detailed'],
  ['playful', 'formal'],
  ['casual', 'formal'],
  ['dry', 'warm'],
  ['unvarnished', 'gentle'],
];

/** How a kept pair works together, said on the sheet and told to the model. */
export const KEEP_BOTH_LINES: Record<string, string> = {
  'blunt+gentle': 'Plain about what’s true, soft in how it’s said.',
  'brief+detailed': 'Short by default, with the detail when it matters.',
  'formal+playful': 'Courteous, with a light touch now and then.',
  'casual+formal': 'Everyday words, kept polite.',
  'dry+warm': 'A dry wit that stays on your side.',
  'gentle+unvarnished': 'Nothing hidden, every word chosen with care.',
};

/** The same key for a pair in either order. */
export const clashKey = (left: PersonalityTrait, right: PersonalityTrait) =>
  [left, right].sort().join('+');

/** Every pair among the traits that pulls apart, in the fixed order of `TRAIT_CLASHES`. */
export const findTraitClashes = (traits: readonly PersonalityTrait[]) =>
  TRAIT_CLASHES.filter(
    ([left, right]) => traits.includes(left) && traits.includes(right),
  ).map(([left, right]) => ({ left, right, key: clashKey(left, right) }));

/** The clashes the person has not chosen to keep yet. */
export const findOpenClashes = (personality: Personality) =>
  findTraitClashes(personality.traits).filter(
    (clash) => !personality.keptClashes.includes(clash.key),
  );

/** The old single tone, read as traits, so a person who picked one keeps how it sounded. */
export const TONE_TRAITS: Record<string, PersonalityTrait[]> = {
  composed: ['honest', 'brief', 'warm'],
  warm: ['warm'],
  brief: ['brief'],
  formal: ['formal'],
};

export const DEFAULT_PERSONALITY: Personality = {
  traits: ['honest', 'brief', 'warm'],
  honesty: 'straight',
  keptClashes: [],
};

const isTrait = (value: unknown): value is PersonalityTrait =>
  PERSONALITY_TRAITS.some((trait) => trait === value);

/** A stored personality read safely: unknown traits and repeats dropped, at most five, a missing one read from the old tone, and kept clashes only for pairs still picked. */
export const readPersonality = (
  stored: unknown,
  legacyTone: unknown,
): Personality => {
  const record =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)
      : null;
  if (record === null) {
    const traits =
      typeof legacyTone === 'string' ? TONE_TRAITS[legacyTone] : undefined;
    return traits
      ? { ...DEFAULT_PERSONALITY, traits: [...traits] }
      : { ...DEFAULT_PERSONALITY, traits: [...DEFAULT_PERSONALITY.traits] };
  }
  const traits = Array.from(
    new Set(Array.isArray(record.traits) ? record.traits.filter(isTrait) : []),
  ).slice(0, MAX_TRAITS);
  const honesty =
    HONESTY_LEVELS.find((level) => level === record.honesty) ?? 'straight';
  const pairs = new Set(findTraitClashes(traits).map((clash) => clash.key));
  const keptClashes = Array.isArray(record.keptClashes)
    ? record.keptClashes.filter(
        (key): key is string => typeof key === 'string' && pairs.has(key),
      )
    : [];
  return { traits, honesty, keptClashes: Array.from(new Set(keptClashes)) };
};

/** The traits as the person reads them: "Honest, Brief, Warm". */
export const describeTraits = (traits: readonly PersonalityTrait[]) =>
  traits.map((trait) => TRAIT_LABELS[trait]).join(', ');

/** The result line's detail for a change: what was added, removed or kept, then the traits it leaves ("Blunt added · Honest, Brief, Warm, Blunt"). */
export const describePersonalityChange = (
  previous: Personality,
  next: Personality,
) => {
  const added = next.traits.filter((trait) => !previous.traits.includes(trait));
  const removed = previous.traits.filter(
    (trait) => !next.traits.includes(trait),
  );
  const kept = next.keptClashes.filter(
    (key) => !previous.keptClashes.includes(key),
  );
  const parts = [
    ...(added.length > 0 ? [`${describeTraits(added)} added`] : []),
    ...(removed.length > 0 ? [`${describeTraits(removed)} removed`] : []),
    ...(next.honesty !== previous.honesty
      ? [HONESTY_LABELS[next.honesty]]
      : []),
    ...kept.map(
      (key) =>
        `Kept ${key
          .split('+')
          .map((trait) => TRAIT_LABELS[trait as PersonalityTrait])
          .join(' and ')}`,
    ),
  ];
  return [parts.join(', '), describeTraits(next.traits)]
    .filter((part) => part !== '')
    .join(' · ');
};

/** What the model is told: each trait's line, the honesty line, how each kept pair works, and the limits no trait lifts. */
export const toPersonalityPrompt = (personality: Personality) => {
  const kept = findTraitClashes(personality.traits)
    .filter((clash) => personality.keptClashes.includes(clash.key))
    .map((clash) => `- ${KEEP_BOTH_LINES[clash.key]}`);
  return [
    ...personality.traits.map((trait) => `- ${TRAIT_PROMPT_LINES[trait]}`),
    `- ${HONESTY_PROMPT_LINES[personality.honesty]}`,
    ...kept,
    '- Whatever the traits: no cheerleading, no emoji, no exclamation marks, never a made-up fact, and health and care stay careful and only ever asked.',
  ].join('\n');
};

/** A stable key for the sample replies, so a personality already previewed is never asked for again. */
export const personalityHash = (personality: Personality) =>
  [
    [...personality.traits].sort().join(','),
    personality.honesty,
    [...personality.keptClashes].sort().join(','),
  ].join('|');

/** The fixed questions the sample replies answer: one hard, one everyday. */
export const PREVIEW_PROMPTS = [
  'Should I skip guitar tonight? I’ve only played once this week.',
  'Did the venue get back to me about Saturday?',
] as const;

/** Shown when the model can't be asked (offline or failed): a code-built sample for the hard question, by the strongest trait. */
export const FIXED_SAMPLES: Record<PersonalityTrait, string> = {
  honest: 'You’ve played once this week. Ten minutes still counts.',
  brief: 'Once this week. Ten minutes tonight?',
  warm: 'You’ve had a full week. Ten minutes tonight would still count.',
  detailed:
    'You’ve played once this week, and skipping tonight makes it a gap of four days. Ten minutes keeps the habit going.',
  dry: 'Once this week. The guitar is starting to feel decorative.',
  blunt: 'You’ve played once this week. Play ten minutes.',
  unvarnished: 'Once this week is a slide. Ten minutes tonight stops it.',
  gentle:
    'It’s been a busy week, and that’s okay. Ten minutes would still count.',
  playful: 'The guitar misses you a little. Ten minutes?',
  casual: 'Just once this week, so maybe give it ten minutes tonight.',
  formal:
    'You have played once this week. Ten minutes this evening would help.',
  encouraging: 'You played once already. Ten minutes tonight keeps it going.',
};

/** The fixed sample for a personality: its first trait's, or the honest one when it has none. */
export const fixedSampleFor = (personality: Personality) =>
  FIXED_SAMPLES[personality.traits[0] ?? 'honest'];
