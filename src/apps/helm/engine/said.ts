import { hasHealthWord } from '@apps/helm/utils/privacy';

/** What was said about a habit or the day: a bounded set both ways, never a diagnosis or a guessed mood. */
export const STRUGGLING_TAGS = [
  'tired',
  'reluctant',
  'tooBusy',
  'unwell',
  'bored',
  'stressed',
] as const;

export const WORKING_TAGS = [
  'enjoyed',
  'easy',
  'proud',
  'energised',
  'madeProgress',
] as const;

/** A body sensation said with a care item: kept as said, never a signal. */
export const OBSERVATION_TAGS = [
  ...STRUGGLING_TAGS,
  ...WORKING_TAGS,
  'bodyEffect',
] as const;

export type ObservationTag = (typeof OBSERVATION_TAGS)[number];

/** Health words that name a condition rather than a medicine, read beside `HEALTH_WORDS`. */
export const OTHERS_HEALTH_WORDS = [
  'panic',
  'anxiety',
  'depressed',
  'diagnosis',
  'surgery',
  'hospital',
  'cancer',
  'pregnant',
  'seizure',
  'attack',
  'symptoms',
] as const;

export const SAID_SIGNAL_DAYS = 3;
export const SAID_WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasWord = (text: string, word: string) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}($|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(text);

/** The quote, or null when it names another person together with a health word; `whoNames` are every who except the person's own. */
export function maskOthersHealth(
  quote: string,
  whoNames: string[],
): string | null {
  const namesOther = whoNames.some(
    (name) => name.trim() !== '' && hasWord(quote, name.trim()),
  );
  const hasHealth =
    hasHealthWord(quote) ||
    OTHERS_HEALTH_WORDS.some((word) => hasWord(quote, word));
  return namesOther && hasHealth ? null : quote;
}

export interface SaidObservation {
  id: string;
  subject: { collection: string; id: string | null };
  dayKey: string;
  at: number;
  tags: readonly string[];
  isCare: boolean;
}

export interface SaidSignal {
  kind: 'struggling' | 'working';
  dayKeys: string[];
  observationIds: string[];
  tags: ObservationTag[];
  isCare: boolean;
}

const shiftDayKey = (dayKey: string, days: number) =>
  new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const hasTagIn = (tags: readonly string[], set: readonly string[]) =>
  tags.some((tag) => set.includes(tag));

const unique = <Item>(items: Item[]) => [...new Set(items)];

/** A struggling or working signal about one habit: the same direction on 3 or more different days in the last 14, after `since`, skipping paused days; both directions in that window is nothing. */
export function readSaidSignals(
  observations: SaidObservation[],
  habitId: string,
  since: number,
  today: string,
  isPausedDay: (dayKey: string) => boolean = () => false,
): SaidSignal | null {
  const from = shiftDayKey(today, -(SAID_WINDOW_DAYS - 1));
  const mine = observations.filter(
    (one) =>
      one.subject.collection === 'habits' &&
      one.subject.id === habitId &&
      one.at >= since &&
      one.dayKey >= from &&
      one.dayKey <= today &&
      !isPausedDay(one.dayKey),
  );
  const struggling = mine.filter((one) => hasTagIn(one.tags, STRUGGLING_TAGS));
  const working = mine.filter((one) => hasTagIn(one.tags, WORKING_TAGS));
  if (struggling.length > 0 && working.length > 0) return null;
  const matched = struggling.length > 0 ? struggling : working;
  const dayKeys = unique(matched.map((one) => one.dayKey)).sort();
  if (dayKeys.length < SAID_SIGNAL_DAYS) return null;
  const set = struggling.length > 0 ? STRUGGLING_TAGS : WORKING_TAGS;
  return {
    kind: struggling.length > 0 ? 'struggling' : 'working',
    dayKeys,
    observationIds: matched.map((one) => one.id),
    tags: unique(
      matched.flatMap((one) =>
        one.tags.filter((tag): tag is ObservationTag =>
          set.some((t) => t === tag),
        ),
      ),
    ),
    isCare: matched.some((one) => one.isCare),
  };
}
