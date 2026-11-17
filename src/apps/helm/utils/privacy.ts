import { createOptionMatcher } from '@/utils/optionMatchUtils';

export type PrivacyClass = 'ordinary' | 'private';
export type PrivateMark = 'health' | 'care' | 'person';
/** Who kept a thing quiet: the person, or the assistant reading that it sounded like a secret. */
export type QuietMark = 'person' | 'guessed';

/** A record's own say about being private; the readable `privacy` is worked out from it and its parents. */
export interface PrivacyFacts {
  privateMark: PrivateMark | null;
  isPrivacyCleared: boolean | null;
  isCare?: boolean | null;
  /** Kept quiet: shown on screen, never said aloud. A quiet thing is always private too. */
  quietMark?: QuietMark | null;
  /** The last day it stays quiet (YYYY-MM-DD, in the person's zone); null keeps it quiet until released. */
  quietUntil?: string | null;
  /** The person released it, so a guess never keeps it quiet again. */
  isQuietCleared?: boolean | null;
}

/** The short closed list a missed health word is read against; a drug's name is the person's to say, so none is listed. */
export const HEALTH_WORDS = [
  'pill',
  'medicine',
  'medication',
  'dose',
  'prescription',
  'refill',
  'inhaler',
  'insulin',
  'therapy',
  'treatment',
] as const;

/** A dose written the way a label or a person says it ("20 mg", "2 tablets"). */
export const DOSE_PATTERN =
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|iu|units?|tabs?|tablets?|pills?|caps?|capsules?|puffs?|drops?)\b/i;

const healthMatcher = createOptionMatcher<string>({
  foldPlurals: true,
  typos: false,
});

export const hasHealthWord = (text: string) =>
  text
    .split(/\s+/)
    .some((word) => healthMatcher.match(word, HEALTH_WORDS) !== null);

/** A record from before the field reads as ordinary. */
export const readPrivacy = (value: unknown): PrivacyClass =>
  value === 'private' ? 'private' : 'ordinary';

export const isPrivateRead = (record: { privacy?: PrivacyClass | null }) =>
  record.privacy === 'private';

export const readPrivacyFacts = (
  value: Partial<PrivacyFacts> | null | undefined,
): PrivacyFacts => ({
  privateMark: value?.privateMark ?? null,
  isPrivacyCleared: value?.isPrivacyCleared ?? false,
  isCare: value?.isCare ?? false,
  quietMark: value?.quietMark ?? null,
  quietUntil: value?.quietUntil ?? null,
  isQuietCleared: value?.isQuietCleared ?? false,
});

const hasOwn = (facts: PrivacyFacts) =>
  facts.privateMark !== null || facts.isCare === true;

/** Whether a thing is private by its own mark, a care mark, or a private parent it is filed under or about. */
export const isPrivateInEffect = (
  facts: PrivacyFacts,
  parents: readonly PrivacyFacts[] = [],
) => hasOwn(facts) || parents.some(hasOwn);

export const readEffectivePrivacy = (
  facts: PrivacyFacts,
  parents: readonly PrivacyFacts[] = [],
): PrivacyClass => (isPrivateInEffect(facts, parents) ? 'private' : 'ordinary');

interface CodeMarkInput {
  current: PrivacyFacts;
  isCare: boolean;
  isForOtherWho: boolean;
  /** The mark the model's command carried; it can add a mark, never take one off. */
  commandMark: 'health' | 'care' | null;
  isSensitiveHealth: boolean;
  words: string;
}

const readCodeMark = (input: CodeMarkInput): 'health' | 'care' | null => {
  if (input.isCare || input.isForOtherWho || input.commandMark === 'care')
    return 'care';
  return input.commandMark === 'health' ||
    input.isSensitiveHealth ||
    hasHealthWord(input.words)
    ? 'health'
    : null;
};

/** The own mark after code has looked at a record: it adds health or care, never clears one, and never marks again a record the person cleared. */
export const readPrivateMark = (input: CodeMarkInput): PrivacyFacts => {
  const { current } = input;
  if (current.isPrivacyCleared) return current;
  const found = readCodeMark(input);
  if (found === null) return current;
  if (current.privateMark === 'care') return current;
  if (current.privateMark === 'health' && found === 'health') return current;
  return { ...current, privateMark: found };
};

/** The own mark after the person's switch or words: on keeps a mark code set, off clears any mark and stops code marking it again. */
export const readPersonMark = (
  current: PrivacyFacts,
  isPrivate: boolean,
): PrivacyFacts => {
  if (isPrivate)
    return {
      ...current,
      privateMark: current.privateMark ?? 'person',
      isPrivacyCleared: false,
    };
  return {
    ...current,
    privateMark: null,
    isCare: false,
    quietMark: null,
    quietUntil: null,
    isQuietCleared:
      (current.quietMark ?? null) !== null || current.isQuietCleared === true,
    isPrivacyCleared:
      current.privateMark === 'health' ||
      current.privateMark === 'care' ||
      current.isCare === true,
  };
};

/** Whether turning a mark off needs the one confirm: only a mark code set. */
export const needsClearConfirm = (facts: PrivacyFacts) =>
  facts.privateMark === 'health' ||
  facts.privateMark === 'care' ||
  facts.isCare === true;

export interface PrivateParent {
  id: string;
  name: string;
  facts: PrivacyFacts;
}

/** The first private parent: where an inherited class comes from. */
export const readInheritedFrom = (parents: readonly PrivateParent[]) =>
  parents.find((parent) => hasOwn(parent.facts)) ?? null;

export const buildInheritedLine = (name: string) =>
  `It's private because ${name} is private. Change it on ${name}'s page?`;

export const buildOnItsPageLine = () =>
  'It was marked private because of what it is about, so change that on its own page.';

export const buildUnattendedReleaseLine = () =>
  'Nothing is made not private while the screen is out of sight. Change it once you are looking.';

export const buildKeptQuietLine = () =>
  "It's kept quiet, so it stays private. Turn off Keep it quiet first.";

export type SetPrivateOutcome =
  | { kind: 'applied'; facts: PrivacyFacts }
  | { kind: 'unchanged' }
  | { kind: 'refused'; line: string };

/** What `setPrivate` does to a thing: on an inherited class it is refused with a code-built line, and a request that changes nothing is left alone. */
export const readSetPrivate = (input: {
  current: PrivacyFacts;
  isPrivate: boolean;
  parents: readonly PrivateParent[];
  today: string;
  /** Set for words said to the assistant: a release is never made while nobody is looking, and a mark code set is only cleared on its page. */
  byTurn?: { isUnattended: boolean };
}): SetPrivateOutcome => {
  const inherited = readInheritedFrom(input.parents);
  if (!input.isPrivate && inherited)
    return { kind: 'refused', line: buildInheritedLine(inherited.name) };
  if (!input.isPrivate && isQuietOn(input.current, input.today))
    return { kind: 'refused', line: buildKeptQuietLine() };
  if (input.isPrivate === hasOwn(input.current)) return { kind: 'unchanged' };
  if (!input.isPrivate && input.byTurn?.isUnattended)
    return { kind: 'refused', line: buildUnattendedReleaseLine() };
  if (!input.isPrivate && input.byTurn && needsClearConfirm(input.current))
    return { kind: 'refused', line: buildOnItsPageLine() };
  return {
    kind: 'applied',
    facts: readPersonMark(input.current, input.isPrivate),
  };
};

/** A derived record (an Activity line, a moment, a turn) is private when any source it rests on is. */
export const readDerivedPrivacy = (
  sourceKeys: readonly string[],
  classOf: (key: string) => PrivacyClass | null | undefined,
): PrivacyClass =>
  sourceKeys.some((key) => classOf(key) === 'private') ? 'private' : 'ordinary';

export const buildLeftOutLine = (count: number) =>
  count === 0
    ? null
    : `${count} private ${count === 1 ? 'thing' : 'things'} left out`;

/** Splits what a copy or export holds: private things are left out and counted, unless this one copy includes them. */
export const filterPrivate = <T>(
  items: readonly T[],
  isPrivate: (item: T) => boolean,
  options: { include?: boolean } = {},
) => {
  const isLeftOut = (item: T) => !options.include && isPrivate(item);
  const leftOut = items.filter(isLeftOut);
  return {
    kept: items.filter((item) => !isLeftOut(item)),
    leftOutCount: leftOut.length,
    line: buildLeftOutLine(leftOut.length),
  };
};

export interface Presence {
  isHidden: boolean;
  isUntouched: boolean;
}

/** A turn is unattended when the wake phrase began it and the page is hidden or untouched. */
export const isUnattendedTurn = (
  startedByWake: boolean,
  presence: Presence | null | undefined,
) =>
  startedByWake &&
  presence !== null &&
  presence !== undefined &&
  (presence.isHidden || presence.isUntouched);

const PRIVATE_TASK = 'a private task';

/** What a private task is called to a model, and aloud, while nobody is looking; built by code from its time of day, never its name or what it seems to be about. */
export const readMaskedLabel = (input: { windowLabel: string | null }) =>
  input.windowLabel
    ? `${PRIVATE_TASK} this ${input.windowLabel}`
    : PRIVATE_TASK;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces any private name still in a reply's text with the same label the context used, longest name first. */
export const maskPrivateNames = (
  text: string,
  names: readonly { name: string; label: string }[],
) =>
  [...names]
    .filter(({ name }) => name.trim() !== '')
    .sort((left, right) => right.name.length - left.name.length)
    .reduce(
      (masked, { name, label }) =>
        masked.replace(
          new RegExp(
            `(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`,
            'giu',
          ),
          label,
        ),
      text,
    );

/** One private thing copied from its own page copies as usual: that tap is deliberate. */
export const filterPrivateOwnPage = <T>(
  item: T,
  isPrivate: (item: T) => boolean,
) => filterPrivate([item], isPrivate, { include: true }).kept[0];

/** Whether a thing is kept quiet on this day by its own mark; the end day is included. */
export const isQuietOn = (facts: PrivacyFacts, today: string) =>
  (facts.quietMark ?? null) !== null &&
  ((facts.quietUntil ?? null) === null || today <= (facts.quietUntil ?? ''));

/** Whether a thing is kept quiet on this day by its own mark or a quiet parent it is filed under or about. */
export const isQuietInEffect = (
  facts: PrivacyFacts,
  parents: readonly PrivacyFacts[],
  today: string,
) => [facts, ...parents].some((each) => isQuietOn(each, today));

/** The first quiet parent: where an inherited quiet comes from. */
export const readQuietFrom = (
  parents: readonly PrivateParent[],
  today: string,
) => parents.find((parent) => isQuietOn(parent.facts, today)) ?? null;

export const buildQuietInheritedLine = (name: string) =>
  `It's kept quiet because ${name} is. Change it on ${name}'s page?`;

export const buildQuietUnattendedLine = () =>
  'Nothing stops being quiet while the screen is out of sight. Change it once you are looking.';

export type SetQuietOutcome =
  | { kind: 'applied'; facts: PrivacyFacts }
  | { kind: 'unchanged' }
  | { kind: 'refused'; line: string };

/** What keeping a thing quiet, or releasing it, does: keeping it quiet makes it private too; a release leaves it private; a guess never touches what the person released or chose. */
export const readSetQuiet = (input: {
  current: PrivacyFacts;
  isQuiet: boolean;
  until: string | null;
  mark: QuietMark;
  parents: readonly PrivateParent[];
  today: string;
  /** Set for words said to the assistant: nothing is released while nobody is looking. */
  byTurn?: { isUnattended: boolean };
}): SetQuietOutcome => {
  const { current } = input;
  const isOn = isQuietOn(current, input.today);
  if (!input.isQuiet) {
    const inherited = readQuietFrom(input.parents, input.today);
    if (inherited)
      return { kind: 'refused', line: buildQuietInheritedLine(inherited.name) };
    if ((current.quietMark ?? null) === null) return { kind: 'unchanged' };
    if (input.byTurn?.isUnattended)
      return { kind: 'refused', line: buildQuietUnattendedLine() };
    return {
      kind: 'applied',
      facts: {
        ...current,
        quietMark: null,
        quietUntil: null,
        isQuietCleared: input.mark === 'person',
      },
    };
  }
  if (
    input.mark === 'guessed' &&
    (current.isQuietCleared || current.isPrivacyCleared || isOn)
  )
    return { kind: 'unchanged' };
  const until =
    input.until !== null && input.until < input.today ? null : input.until;
  if (
    isOn &&
    current.quietMark === input.mark &&
    (current.quietUntil ?? null) === until
  )
    return { kind: 'unchanged' };
  return {
    kind: 'applied',
    facts: {
      ...current,
      privateMark: current.privateMark ?? 'person',
      isPrivacyCleared: false,
      quietMark: current.quietMark === 'person' ? 'person' : input.mark,
      quietUntil: until,
      isQuietCleared: false,
    },
  };
};

/** The only thing said aloud for a turn that touches a quiet thing. */
export const QUIET_SPOKEN_LINE = "I've put that on your screen.";

/** What a turn says aloud: a quiet turn says only the screen line, and its own line is held for Say it aloud this time. */
export const holdQuietSpoken = (spoken: string | null, isQuiet: boolean) =>
  !isQuiet || spoken === null || spoken === QUIET_SPOKEN_LINE
    ? { spoken, heldSpoken: null }
    : { spoken: QUIET_SPOKEN_LINE, heldSpoken: spoken };

/** Whether words name a quiet thing, as whole words in any case. */
export const mentionsQuietName = (text: string, names: readonly string[]) =>
  names
    .filter((name) => name.trim() !== '')
    .some((name) =>
      new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegExp(name.trim())}(?![\\p{L}\\p{N}])`,
        'iu',
      ).test(text),
    );
