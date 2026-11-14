import { createOptionMatcher } from '@/utils/optionMatchUtils';

export type PrivacyClass = 'ordinary' | 'private';
export type PrivateMark = 'health' | 'care' | 'person';

/** A record's own say about being private; the readable `privacy` is worked out from it and its parents. */
export interface PrivacyFacts {
  privateMark: PrivateMark | null;
  isPrivacyCleared: boolean | null;
  isCare?: boolean | null;
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

export type SetPrivateOutcome =
  | { kind: 'applied'; facts: PrivacyFacts }
  | { kind: 'unchanged' }
  | { kind: 'refused'; line: string };

/** What `setPrivate` does to a thing: on an inherited class it is refused with a code-built line, and a request that changes nothing is left alone. */
export const readSetPrivate = (input: {
  current: PrivacyFacts;
  isPrivate: boolean;
  parents: readonly PrivateParent[];
  /** Set for words said to the assistant: a release is never made while nobody is looking, and a mark code set is only cleared on its page. */
  byTurn?: { isUnattended: boolean };
}): SetPrivateOutcome => {
  const inherited = readInheritedFrom(input.parents);
  if (!input.isPrivate && inherited)
    return { kind: 'refused', line: buildInheritedLine(inherited.name) };
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
