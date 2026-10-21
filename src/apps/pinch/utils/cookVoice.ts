import { toPlainText } from '@/lib/speech/speechText';
import { findDurations, formatDuration } from '@/utils/durationUtils';
import { MAX_KITCHEN_TIMER_SECONDS } from '@apps/pinch/constants';

/** A spoken phrase longer than this is talk, not a command. */
const MAX_COMMAND_CHARS = 80;
const MAX_QUERY_WORDS = 4;
/** "Cups of rice" names a quantity before the ingredient: the words that can stand there. */
const QUANTITY_WORDS = new Set([
  'cup',
  'tablespoon',
  'tbsp',
  'teaspoon',
  'tsp',
  'spoon',
  'spoonful',
  'ounce',
  'oz',
  'fluid ounce',
  'pound',
  'lb',
  'gram',
  'g',
  'kilogram',
  'kg',
  'milliliter',
  'ml',
  'liter',
  'litre',
  'quart',
  'pint',
  'clove',
  'can',
  'tin',
  'jar',
  'pinch',
  'dash',
  'handful',
  'bunch',
  'sprig',
  'stick',
  'slice',
  'piece',
  'head',
  'leaf',
  'package',
  'packet',
  'bag',
  'inch',
]);
const MAX_AMOUNT_MATCHES = 3;

export type CookTimerScope = 'RINGING' | 'ANY';

/** Which timer a spoken command means: one of that length ("the ten minute timer"), one called that ("the pasta timer"), or every one. With none of the three it means "the timer", which the screen settles (the one in front, else it asks). */
export interface CookTimerTarget {
  seconds: number | null;
  name: string | null;
  isAll: boolean;
}

export const NO_TIMER_TARGET: CookTimerTarget = {
  seconds: null,
  name: null,
  isAll: false,
};

/** What the person said to a question about timers, which only a pending question can hear. */
export type CookTimerAnswer =
  | { kind: 'PICK'; ids: string[]; isAll: boolean }
  | { kind: 'LENGTH'; seconds: number }
  | { kind: 'NEVER_MIND' };

export type CookCommand =
  | { kind: 'NEXT' }
  | { kind: 'BACK' }
  | { kind: 'REPEAT' }
  | { kind: 'SHOW_INGREDIENTS' }
  | { kind: 'SHOW_STEPS' }
  | { kind: 'FINISH' }
  | { kind: 'SHOW_TIMERS' }
  | { kind: 'START_TIMER'; seconds: number | null; name: string | null }
  | { kind: 'PAUSE_TIMER'; target: CookTimerTarget }
  | { kind: 'RESUME_TIMER'; target: CookTimerTarget }
  | { kind: 'STOP_TIMER'; target: CookTimerTarget; scope: CookTimerScope }
  | { kind: 'EXTEND_TIMER'; seconds: number; target: CookTimerTarget }
  | { kind: 'TIME_LEFT'; target: CookTimerTarget }
  | { kind: 'TIMER_ANSWER'; answer: CookTimerAnswer }
  | { kind: 'AMOUNT'; query: string; lineIds: string[] }
  | { kind: 'SWITCH_RECIPE'; recipeId: string | null; candidates: string[] }
  | { kind: 'CYCLE_RECIPE'; direction: 1 | -1 }
  | { kind: 'STOP_LISTENING' };

/** A timer as a spoken name can reach it: every name it goes by (its step's first words, a kitchen timer's name, its recipe) and its length as the card shows it ("10 min"). */
export interface CookVoiceTimer {
  id: string;
  names: string[];
  label: string;
}

/** A question the app asked and is waiting on: which timer, or how long a new one runs. */
export type CookVoiceChoice =
  { kind: 'TIMER'; timers: CookVoiceTimer[] } | { kind: 'LENGTH' };

export interface CookVoiceContext {
  /** The recipes on screen, in plate order; one for a single recipe. */
  recipes: { id: string; title: string }[];
  shownRecipeId: string;
  /** The shown recipe's lines with every name each goes by; `isInStep` marks the lines the shown step names. */
  lines: { id: string; names: string[]; isInStep: boolean }[];
  /** The session's timers, so a name said without the word "timer" ("pause the pasta") still counts. */
  timers: CookVoiceTimer[];
  /** The question waiting for an answer, if any; only then does a bare name, "the second one" or "ten minutes" mean something. */
  choice: CookVoiceChoice | null;
}

type PlainKind =
  | 'NEXT'
  | 'BACK'
  | 'REPEAT'
  | 'SHOW_INGREDIENTS'
  | 'SHOW_STEPS'
  | 'SHOW_TIMERS'
  | 'FINISH'
  | 'STOP_LISTENING';

// Only what "What to say" shows and plain synonyms of it: an everyday phrase ("go on", "again") is said to people too.
const PHRASES: Record<PlainKind, string[]> = {
  NEXT: [
    'next',
    'next step',
    'next one',
    'go to the next step',
    'go to next step',
  ],
  BACK: [
    'back',
    'go back',
    'previous',
    'previous step',
    'previous one',
    'back one',
    'back a step',
    'go back a step',
    'go back one',
  ],
  REPEAT: [
    'repeat',
    'repeat that',
    'repeat it',
    'repeat the step',
    'repeat step',
    'read it',
    'read it again',
    'read the step',
    'read step',
    'read this step',
  ],
  SHOW_INGREDIENTS: [
    'ingredients',
    'the ingredients',
    'show ingredients',
    'show the ingredients',
    'show me the ingredients',
    'ingredient list',
    'the ingredient list',
    'show the ingredient list',
    'go to ingredients',
    'go to the ingredients',
    'open ingredients',
    'open the ingredients',
  ],
  SHOW_STEPS: [
    'steps',
    'the steps',
    'show steps',
    'show the steps',
    'show me the steps',
    'back to the steps',
    'back to steps',
    'go to steps',
    'go to the steps',
  ],
  SHOW_TIMERS: [
    'timers',
    'the timers',
    'show timers',
    'show the timers',
    'show me the timers',
    'show my timers',
    'open timers',
    'open the timers',
    'go to timers',
    'go to the timers',
    'my timers',
  ],
  FINISH: [
    'finish',
    'done',
    'im done',
    'i am done',
    'mark as cooked',
    'mark it as cooked',
  ],
  STOP_LISTENING: [
    'stop listening',
    'turn off voice',
    'turn voice off',
    'turn off voice control',
    'turn voice control off',
    'voice off',
    'voice control off',
    'stop voice',
    'stop voice control',
    'mic off',
    'microphone off',
    'turn off the mic',
    'turn the mic off',
    'turn off the microphone',
    'turn the microphone off',
    'stop the mic',
  ],
};

const TIME_LEFT_PHRASES = new Set([
  'how much time is left',
  'how much time left',
  'how much time is remaining',
  'how much time remaining',
  'time left',
  'time remaining',
  'how long left',
  'how long is left',
  'whats the time left',
  'whats the timer at',
  'timer check',
  'check the timer',
  'check timer',
  'hows the timer',
  'hows the timer doing',
  'is the timer done',
]);
const LISTED_TIMERS_PHRASES = new Set([
  'what timers are running',
  'what timers are going',
  'what timers are set',
  'what timers do i have',
  'which timers are running',
  'list timers',
  'list the timers',
  'list my timers',
  'read the timers',
  'read my timers',
]);

const CYCLE_PHRASES: Record<string, 1 | -1> = {
  'next recipe': 1,
  'next dish': 1,
  'switch recipe': 1,
  'switch recipes': 1,
  'switch dish': 1,
  'switch dishes': 1,
  'change recipe': 1,
  'change dish': 1,
  'previous recipe': -1,
  'previous dish': -1,
};

const EXACT = new Map<string, PlainKind>(
  (Object.entries(PHRASES) as [PlainKind, string[]][]).flatMap(
    ([kind, phrases]) => phrases.map((phrase) => [phrase, kind] as const),
  ),
);

const LEAD_IN =
  /^(?:(?:ok|okay|hey|hi|pepper|pinch|alright|all right|so|um|uh|er|please|lets|can you|could you|would you)\s+)+/;
const TAIL = /\s+(?:please|thanks|thank you|now)$/;
const TIMER_SUFFIX =
  / (?:on|for|in|until|till) (?:the |my |this )?(?:[a-z0-9 ]+ )?(?:timer|timers|clock)$/;

type TimerVerb = 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'EXTEND';

const TIMER_VERBS: Record<string, TimerVerb> = {
  start: 'START',
  set: 'START',
  begin: 'START',
  run: 'START',
  pause: 'PAUSE',
  hold: 'PAUSE',
  resume: 'RESUME',
  unpause: 'RESUME',
  continue: 'RESUME',
  stop: 'STOP',
  dismiss: 'STOP',
  silence: 'STOP',
  cancel: 'STOP',
  reset: 'STOP',
  clear: 'STOP',
  end: 'STOP',
  quiet: 'STOP',
  mute: 'STOP',
  'turn off': 'STOP',
  'shut off': 'STOP',
  add: 'EXTEND',
  extend: 'EXTEND',
  give: 'EXTEND',
  increase: 'EXTEND',
};

/** Said with no "timer" after them, these still mean the timer ("pause", "stop" for a ringing one). */
const BARE_TIMER_VERBS = new Set([
  'pause',
  'resume',
  'unpause',
  'stop',
  'dismiss',
  'silence',
]);

const TIMER_VERB_PATTERN = new RegExp(
  String.raw`^(?<verb>${Object.keys(TIMER_VERBS).join('|')})(?: (?<rest>.+))?$`,
);
const MAX_NAME_WORDS = 4;
const TIMER_NOUNS = new Set([
  'timer',
  'timers',
  'alarm',
  'alarms',
  'countdown',
  'countdowns',
]);
const ALL_WORDS = new Set(['all', 'every', 'everything', 'both', 'each']);
/** Words around a timer's name that are not part of it ("the pasta timer for ten minutes" is "pasta"). */
const NAME_NOISE = new Set([
  'the',
  'a',
  'an',
  'my',
  'that',
  'this',
  'these',
  'those',
  'for',
  'on',
  'to',
  'of',
  'by',
  'in',
  'at',
  'it',
  'up',
  'again',
  'another',
  'more',
  'extra',
  'and',
  'just',
  'one',
  'now',
  'please',
  'called',
  'named',
  'labeled',
  'titled',
]);

const AMOUNT_PATTERN =
  /^(?:how (?:much|many)|whats the amount of|amount of|how much of) (?<query>.+?)(?: (?:do (?:i|we) need|do (?:i|we) use|do (?:i|we) add|goes in|go in|does it need|does it take|is needed|is it|is that|is in this|is in it|goes in this|are there|in this step|for this step|in this|in it|again))?$/;

const SWITCH_PATTERN = /^(?:switch to|go to|show me) (?:the )?(?<query>.+)$/;

const NAME_FILLER = new Set([
  'the',
  'a',
  'an',
  'and',
  'with',
  'of',
  'in',
  'n',
  'on',
  'my',
  'some',
  'for',
]);

const QUERY_STOP_WORDS = new Set([
  'i',
  'you',
  'we',
  'he',
  'she',
  'they',
  'it',
  'its',
  'that',
  'this',
  'these',
  'those',
  'do',
  'does',
  'did',
  'is',
  'are',
  'was',
  'were',
  'be',
  'to',
  'me',
  'your',
  'our',
  'their',
  'money',
  'cost',
  'costs',
  'time',
  'longer',
  'long',
  'left',
  'more',
  'should',
  'would',
  'could',
  'can',
  'will',
  'have',
  'has',
  'had',
  'there',
  'here',
  'what',
]);

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const PLURAL_EXCEPTIONS: Record<string, string> = {
  leaves: 'leaf',
  halves: 'half',
  loaves: 'loaf',
};

export { toPlainText };

/** Lower case, accents and punctuation off, and a leading "okay", "hey", "pepper" or "pinch" and a trailing "please" dropped. */
export const normalizeTranscript = (transcript: string) => {
  const result = toPlainText(transcript)
    .replace(LEAD_IN, '')
    .replace(TAIL, '')
    .trim();
  return result;
};

/** A word's singular, roughly, so "tomatoes" finds "Tomato" and "bay leaves" finds "Bay leaf". */
export const toSingular = (word: string) => {
  if (PLURAL_EXCEPTIONS[word]) return PLURAL_EXCEPTIONS[word];
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (/(?:ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
};

const toNameWords = (text: string) =>
  Array.from(
    new Set(
      toPlainText(text)
        .split(' ')
        .filter((word) => word !== '' && !NAME_FILLER.has(word))
        .map(toSingular),
    ),
  );

/** The items whose name holds every word of the query: an exact name first, then the fewest words left over (or, with `keepsAll`, every one that holds them). */
export const matchByName = <T extends { id: string; names: string[] }>(
  query: string,
  items: T[],
  keepsAll = false,
): T[] => {
  const wanted = toNameWords(query);
  if (wanted.length === 0) return [];
  const scored = items.flatMap((item) => {
    const scores = item.names
      .map(toNameWords)
      .filter((words) => wanted.every((word) => words.includes(word)))
      .map((words) => words.length - wanted.length);
    return scores.length === 0 ? [] : [{ item, score: Math.min(...scores) }];
  });
  if (scored.length === 0) return [];
  const best = Math.min(...scored.map((entry) => entry.score));
  const result = scored
    .filter((entry) => entry.score === best || (keepsAll && best > 0))
    .map((entry) => entry.item);
  return result;
};

const wordsToDigits = (text: string) =>
  text
    .replace(/\bhalf an hour\b/g, '30 minutes')
    .replace(
      /(?:^|\b(?:a|an|one) )(hour|minute|second)s? and a half\b/g,
      '1.5 $1s',
    )
    .split(' ')
    .reduce<string[]>((words, word) => {
      const previous = Number(words[words.length - 1]);
      const ones = ONES[word];
      if (
        ones !== undefined &&
        ones > 0 &&
        ones < 10 &&
        Object.values(TENS).includes(previous)
      ) {
        return [...words.slice(0, -1), String(previous + ones)];
      }
      const number = ones ?? TENS[word];
      return [...words, number === undefined ? word : String(number)];
    }, [])
    .join(' ')
    .replace(/\b(\d+) and a half (hour|minute|second)/g, '$1.5 $2')
    .replace(/\b(\d+) (hour|minute|second)s? and a half\b/g, '$1.5 $2s')
    .replace(/\b(?:a|an) (hour|minute|second)\b/g, '1 $1');

/** A spoken length of time that is nothing but a length ("ten minute", "1 hour 30 minutes"), in seconds; null for anything else. */
export const readSpokenDuration = (text: string): number | null => {
  const digits = wordsToDigits(text);
  const found = findDurations(digits);
  if (found.length !== 1) return null;
  const rest = digits.replace(found[0].text, '').trim();
  return rest === '' ? found[0].seconds : null;
};

const LENGTH_UNITS = '(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)';
const MORE_TIME = new RegExp(
  String.raw`^(?<another>another )?(?<length>\d+(?:\.\d+)? ${LENGTH_UNITS})(?: (?:on|for|to|in) (?<rest>.+))?$`,
);
const TIME_LEFT_QUERY =
  /^(?:how much time|how long|how many minutes)(?: is| are| do i have)?(?: left| remaining)?(?: (?:on|for|in|of|until|till) (?<query>.+))?$/;

/** "five more minutes" is "5 minutes", and what is left of the words once the length is taken out. */
const readTimerWords = (text: string) => {
  // "the hour and a half" is a length only once "the" is out of the way.
  const spoken = wordsToDigits(
    text.replace(/\b(?:the|my|that|this)\b ?/g, ''),
  ).replace(new RegExp(String.raw`(\d) more (${LENGTH_UNITS})`, 'g'), '$1 $2');
  const found = findDurations(spoken);
  if (found.length > 1) return null;
  const words = (found[0] ? spoken.replace(found[0].text, ' ') : spoken)
    .split(' ')
    .filter(Boolean);
  const nouns = words.filter((word) => TIMER_NOUNS.has(word));
  const nameWords = words.filter(
    (word) =>
      !NAME_NOISE.has(word) && !TIMER_NOUNS.has(word) && !ALL_WORDS.has(word),
  );
  if (nameWords.length > MAX_NAME_WORDS) return null;
  const name = nameWords.length === 0 ? null : nameWords.join(' ');
  const isPlural = nouns.some((noun) => noun.endsWith('s'));
  return {
    seconds: found[0]?.seconds ?? null,
    name,
    hasNoun: nouns.length > 0,
    isAlarm:
      nouns.length > 0 && nouns.every((noun) => noun.startsWith('alarm')),
    isAll:
      words.some((word) => ALL_WORDS.has(word)) ||
      (isPlural && name === null && found.length === 0),
  };
};

const isKnownTimerName = (name: string | null, context: CookVoiceContext) =>
  name !== null && matchByName(name, context.timers).length > 0;

const parseMoreTime = (
  text: string,
  context: CookVoiceContext,
): CookCommand | null => {
  const spoken = wordsToDigits(text);
  const hasMore = new RegExp(String.raw`\d more ${LENGTH_UNITS}`).test(spoken);
  const groups = spoken
    .replace(new RegExp(String.raw`(\d) more (${LENGTH_UNITS})`), '$1 $2')
    .match(MORE_TIME)?.groups;
  if (!groups || !(hasMore || groups.another)) return null;
  const length = readSpokenDuration(groups.length);
  const read = readTimerWords(groups.rest ?? '');
  if (length === null || read === null || read.seconds !== null) return null;
  if (!(
    read.hasNoun ||
    (read.name === null && context.timers.length > 0) ||
    isKnownTimerName(read.name, context)
  )) {
    return null;
  }
  return {
    kind: 'EXTEND_TIMER',
    seconds: length,
    target: { seconds: null, name: read.name, isAll: read.isAll },
  };
};

const parseTimer = (
  text: string,
  context: CookVoiceContext,
): CookCommand | null => {
  const groups = text.match(TIMER_VERB_PATTERN)?.groups;
  if (!groups) return parseMoreTime(text, context);
  const verb = TIMER_VERBS[groups.verb];
  const read = readTimerWords(groups.rest ?? '');
  if (read === null) return null;
  const { seconds, name, hasNoun, isAll } = read;
  const isKnown = isKnownTimerName(name, context);
  if (verb === 'START') {
    return hasNoun && !isAll ? { kind: 'START_TIMER', seconds, name } : null;
  }
  if (verb === 'EXTEND') {
    const isTalk =
      groups.verb === 'give' && !/\bmore\b/.test(groups.rest ?? '');
    if (seconds === null || isTalk) return null;
    if (!(hasNoun || (name === null && context.timers.length > 0) || isKnown)) {
      return null;
    }
    return {
      kind: 'EXTEND_TIMER',
      seconds,
      target: { seconds: null, name, isAll },
    };
  }
  const isTimerTalk =
    hasNoun ||
    (seconds === null &&
      (name === null
        ? BARE_TIMER_VERBS.has(groups.verb) &&
          (groups.rest === undefined || /^all(?: of them)?$/.test(groups.rest))
        : isKnown));
  if (!isTimerTalk) return null;
  const target: CookTimerTarget = { seconds, name, isAll };
  if (verb === 'PAUSE') return { kind: 'PAUSE_TIMER', target };
  if (verb === 'RESUME') return { kind: 'RESUME_TIMER', target };
  const isAlarm = !hasNoun || read.isAlarm;
  return {
    kind: 'STOP_TIMER',
    target,
    scope:
      isAlarm && seconds === null && name === null && !isAll
        ? 'RINGING'
        : 'ANY',
  };
};

const parseTimeLeft = (
  text: string,
  context: CookVoiceContext,
): CookCommand | null => {
  if (LISTED_TIMERS_PHRASES.has(text)) {
    return { kind: 'TIME_LEFT', target: { ...NO_TIMER_TARGET, isAll: true } };
  }
  const query = text.match(TIME_LEFT_QUERY)?.groups?.query;
  if (query === undefined) return null;
  const read = readTimerWords(query);
  if (read === null) return null;
  const isTimerTalk =
    read.hasNoun || read.isAll || isKnownTimerName(read.name, context);
  if (!isTimerTalk) return null;
  return {
    kind: 'TIME_LEFT',
    target: { seconds: read.seconds, name: read.name, isAll: read.isAll },
  };
};

const CANCEL_ANSWERS = new Set([
  'never mind',
  'nevermind',
  'forget it',
  'cancel',
  'cancel that',
  'no',
  'nope',
  'nothing',
  'none',
  'neither',
  'skip',
  'leave it',
  'no thanks',
]);
const ALL_ANSWERS = new Set([
  'all',
  'all of them',
  'both',
  'both of them',
  'all timers',
  'all the timers',
  'all of the timers',
  'every one',
  'every timer',
  'everything',
  'them',
  'each',
  'each one',
]);
const ORDINALS: Record<string, number> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};
const ANSWER_NOISE = new Set([
  'the',
  'a',
  'an',
  'my',
  'that',
  'this',
  'one',
  'timer',
  'timers',
  'please',
  'it',
  'for',
  'number',
]);

const answer = (value: CookTimerAnswer): CookCommand => ({
  kind: 'TIMER_ANSWER',
  answer: value,
});

const parseLengthAnswer = (text: string): CookCommand | null => {
  const spoken = wordsToDigits(text);
  const seconds =
    readSpokenDuration(text) ??
    (/^\d+(?:\.\d+)?$/.test(spoken) ? Math.round(Number(spoken) * 60) : null);
  return seconds !== null && seconds > 0 && seconds <= MAX_KITCHEN_TIMER_SECONDS
    ? answer({ kind: 'LENGTH', seconds })
    : null;
};

const parseTimerAnswer = (
  text: string,
  timers: CookVoiceTimer[],
): CookCommand | null => {
  const ids = timers.map((timer) => timer.id);
  if (ALL_ANSWERS.has(text)) {
    return answer({ kind: 'PICK', ids, isAll: true });
  }
  const trimmed = text
    .split(' ')
    .filter((word) => !ANSWER_NOISE.has(word))
    .join(' ');
  const ordinal = /^(?:the |number )?one$/.test(text)
    ? 1
    : trimmed === 'last'
      ? ids.length
      : (ORDINALS[trimmed] ?? Number(wordsToDigits(trimmed)));
  if (Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= ids.length) {
    return answer({ kind: 'PICK', ids: [ids[ordinal - 1]], isAll: false });
  }
  const seconds = readSpokenDuration(trimmed);
  const byLength =
    seconds === null
      ? []
      : timers.filter((timer) => timer.label === formatDuration(seconds));
  const matched = byLength.length > 0 ? byLength : matchByName(trimmed, timers);
  return matched.length === 0
    ? null
    : answer({
        kind: 'PICK',
        ids: matched.map((timer) => timer.id),
        isAll: false,
      });
};

/** What a bare answer means while a question waits: never mind, how long, or which timer. Null for anything else, so ordinary talk is still not a command. */
const parseChoiceAnswer = (
  text: string,
  context: CookVoiceContext,
): CookCommand | null => {
  const { choice } = context;
  if (choice === null) return null;
  if (CANCEL_ANSWERS.has(text)) return answer({ kind: 'NEVER_MIND' });
  return choice.kind === 'LENGTH'
    ? parseLengthAnswer(text)
    : parseTimerAnswer(text, choice.timers);
};

const cleanQuery = (query: string) =>
  query.replace(/^(?:of )?(?:the |a |an |some )?/, '').trim();

/** The ingredient words after a leading quantity ("cups of rice" is "rice"), or null when the query doesn't start with one. */
const dropQuantity = (words: string[]) => {
  const at = words.indexOf('of');
  if (at < 1 || at > 2 || at === words.length - 1) return null;
  const unit = words.slice(0, at).map(toSingular).join(' ');
  return QUANTITY_WORDS.has(unit) ? words.slice(at + 1) : null;
};

const parseAmount = (
  text: string,
  context: CookVoiceContext,
): CookCommand | null => {
  const raw = text.match(AMOUNT_PATTERN)?.groups?.query;
  if (!raw) return null;
  const query = cleanQuery(raw);
  const words = query.split(' ').filter(Boolean);
  const ingredientWords = dropQuantity(words) ?? words;
  if (
    ingredientWords.length === 0 ||
    ingredientWords.length > MAX_QUERY_WORDS ||
    words.some((word) => QUERY_STOP_WORDS.has(word))
  ) {
    return null;
  }
  const asked = matchByName(query, context.lines);
  const matches =
    asked.length > 0 || ingredientWords === words
      ? asked
      : matchByName(ingredientWords.join(' '), context.lines);
  const inStep = matches.filter((line) => line.isInStep);
  const lineIds = (inStep.length > 0 ? inStep : matches)
    .slice(0, MAX_AMOUNT_MATCHES)
    .map((line) => line.id);
  return { kind: 'AMOUNT', query, lineIds };
};

const parseSwitch = (
  text: string,
  context: CookVoiceContext,
): CookCommand | null => {
  const query = text.match(SWITCH_PATTERN)?.groups?.query;
  if (!query) return null;
  const matches = matchByName(
    query,
    context.recipes.map((recipe) => ({ ...recipe, names: [recipe.title] })),
    true,
  );
  if (matches.length === 0) return null;
  const others = matches.filter(
    (recipe) => recipe.id !== context.shownRecipeId,
  );
  const getRecipeId = () => {
    if (matches.length === 1) return matches[0].id;
    if (others.length === 1) return others[0].id;
    return null;
  };
  return {
    kind: 'SWITCH_RECIPE',
    recipeId: getRecipeId(),
    candidates: matches.map((recipe) => recipe.id),
  };
};

const parseOne = (
  transcript: string,
  context: CookVoiceContext,
): CookCommand | null => {
  if (transcript.length > MAX_COMMAND_CHARS * 2) return null;
  const text = normalizeTranscript(transcript);
  if (text === '' || text.length > MAX_COMMAND_CHARS) return null;

  const exact = EXACT.get(text);
  if (exact) return { kind: exact };
  const named = parseTimeLeft(text, context);
  if (named) return named;
  if (
    TIME_LEFT_PHRASES.has(text) ||
    TIME_LEFT_PHRASES.has(text.replace(TIMER_SUFFIX, ''))
  ) {
    return { kind: 'TIME_LEFT', target: NO_TIMER_TARGET };
  }
  const direction = CYCLE_PHRASES[text];
  if (direction !== undefined) return { kind: 'CYCLE_RECIPE', direction };
  const result =
    parseTimer(text, context) ??
    parseAmount(text, context) ??
    parseSwitch(text, context) ??
    parseChoiceAnswer(text, context);
  return result;
};

const NAVIGATION_KINDS = new Set<CookCommand['kind']>([
  'NEXT',
  'BACK',
  'REPEAT',
  'SHOW_INGREDIENTS',
  'SHOW_STEPS',
  'FINISH',
]);

/** A lower-ranked guess counts only as a phrase of two or more words that isn't a move ("black" heard as "back" never moves the step). */
const isTrustedAlternate = (guess: string, command: CookCommand) =>
  normalizeTranscript(guess).split(' ').length > 1 &&
  !NAVIGATION_KINDS.has(command.kind);

/** The command a finished phrase is and the guess it came from, or null when no guess is a whole command: the recognizer's top guess, else a longer phrase among its other guesses. */
export const readCookCommand = (
  alternatives: string | string[],
  context: CookVoiceContext,
): { command: CookCommand; transcript: string } | null => {
  const guesses =
    typeof alternatives === 'string' ? [alternatives] : alternatives;
  const result = guesses.reduce<{
    command: CookCommand;
    transcript: string;
  } | null>((found, guess, rank) => {
    if (found !== null) return found;
    const command = parseOne(guess, context);
    if (command === null) return null;
    if (rank > 0 && !isTrustedAlternate(guess, command)) return null;
    return { command, transcript: normalizeTranscript(guess) };
  }, null);
  return result;
};

/** The command a finished phrase is, or null when it isn't a whole command: kitchen talk never moves the screen. */
export const parseCookCommand = (
  alternatives: string | string[],
  context: CookVoiceContext,
): CookCommand | null =>
  readCookCommand(alternatives, context)?.command ?? null;

/** One key per command, so the same command heard twice in a row can be told apart from a new one. */
export const getCookCommandKey = (command: CookCommand) =>
  JSON.stringify(command);

const SPOKEN_FRACTIONS: Record<string, string> = {
  '½': 'a half',
  '¼': 'a quarter',
  '¾': 'three quarters',
  '⅓': 'a third',
  '⅔': 'two thirds',
  '⅛': 'an eighth',
};

const SPOKEN_UNITS: Record<string, [string, string]> = {
  tbsp: ['tablespoon', 'tablespoons'],
  tsp: ['teaspoon', 'teaspoons'],
  oz: ['ounce', 'ounces'],
  'fl oz': ['fluid ounce', 'fluid ounces'],
  lb: ['pound', 'pounds'],
  g: ['gram', 'grams'],
  kg: ['kilogram', 'kilograms'],
  ml: ['milliliter', 'milliliters'],
  l: ['liter', 'liters'],
};

const AMOUNT_TEXT =
  /^(?<about>about )?(?<whole>\d+(?:\.\d+)?)?(?<fraction>[½¼¾⅓⅔⅛])?(?: (?<unit>.+))?$/;

/** A kitchen amount as it is said rather than written: "1½ tbsp" is "1 and a half tablespoons". */
export const toSpokenAmount = (amountText: string) => {
  const groups = amountText.match(AMOUNT_TEXT)?.groups;
  if (!groups || (!groups.whole && !groups.fraction)) return amountText;
  const whole = groups.whole ? Number(groups.whole) : 0;
  const fraction = groups.fraction ? SPOKEN_FRACTIONS[groups.fraction] : null;
  const getNumber = () => {
    if (fraction === null) return groups.whole;
    if (whole === 0) return fraction;
    return `${groups.whole} and ${fraction}`;
  };
  const unitWords = groups.unit ? SPOKEN_UNITS[groups.unit] : undefined;
  const isOne = whole <= 1 && (whole === 0 || fraction === null);
  const getUnit = () => {
    if (!groups.unit) return '';
    if (!unitWords) return ` ${groups.unit}`;
    return ` ${isOne ? unitWords[0] : unitWords[1]}`;
  };
  const result = `${groups.about ?? ''}${getNumber()}${getUnit()}`;
  return result;
};

/** A time left as said aloud, never more than is left: "12 minutes" from ten minutes up, "2 minutes 30 seconds" under that. */
export const formatSpokenTime = (milliseconds: number) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const say = (count: number, unit: string) =>
    `${count} ${unit}${count === 1 ? '' : 's'}`;
  if (hours > 0) {
    return [say(hours, 'hour'), minutes > 0 && say(minutes, 'minute')]
      .filter(Boolean)
      .join(' ');
  }
  if (total >= 600) return say(minutes, 'minute');
  const result = [
    minutes > 0 && say(minutes, 'minute'),
    (seconds > 0 || minutes === 0) && say(seconds, 'second'),
  ]
    .filter(Boolean)
    .join(' ');
  return result;
};

export interface VoiceTimerState {
  /** "30 min", what the timer is called on its card. */
  label: string;
  /** What the timer is called in the strip ("Marinate the chicken"). */
  name: string;
  status: 'running' | 'paused' | 'done';
  remainingMs: number;
  /** The time left as the card shows it ("12:30"). */
  clock: string;
  /** What the person called a timer they set themselves ("Pasta water"), so it is told by that and not by its length; null for a step's timer. */
  callName?: string | null;
}

const SPOKEN_LABEL_UNITS: Record<string, string> = {
  h: 'hour',
  min: 'minute',
  sec: 'second',
};

/** A timer's length as said aloud: "30 min" is "30 minute", as in "the 30 minute timer", and "1 h 30 min" is "1 hour 30 minutes". */
export const toSpokenLabel = (label: string) => {
  const parts = Array.from(label.matchAll(/(\d+) (h|min|sec)\b/g));
  if (parts.length === 0) return label;
  const isCompound = parts.length > 1;
  const result = parts
    .map(([, count, unit]) => {
      const word = SPOKEN_LABEL_UNITS[unit];
      return `${count} ${word}${isCompound && count !== '1' ? 's' : ''}`;
    })
    .join(' ');
  return result;
};

const describeOneTimer = (timer: VoiceTimerState) => {
  const shownName = timer.callName ?? timer.label;
  const spokenName = timer.callName ?? toSpokenLabel(timer.label);
  if (timer.status === 'done') {
    return {
      show: `The ${shownName} timer is done`,
      speak: `The ${spokenName} timer is done.`,
    };
  }
  const isPaused = timer.status === 'paused';
  return {
    show: `${timer.clock} left on the ${shownName} timer${isPaused ? ' (paused)' : ''}`,
    speak: `${formatSpokenTime(timer.remainingMs)} left on the ${spokenName} timer.${isPaused ? " It's paused." : ''}`,
  };
};

/** The answer to "how much time is left": a line to show (the clocks only, since the pills name the timers) and a sentence to say, naming each timer only when there are several; `more` is how many were left out of the list. */
export const describeTimersLeft = (timers: VoiceTimerState[], more = 0) => {
  if (timers.length === 1) return describeOneTimer(timers[0]);
  const parts = timers.map((timer) => {
    if (timer.status === 'done') {
      return { show: 'Done', speak: `${timer.name} is done.` };
    }
    const paused = timer.status === 'paused' ? ', paused' : '';
    return {
      show: `${timer.clock} left${paused}`,
      speak: `${timer.name}: ${formatSpokenTime(timer.remainingMs)} left${paused}.`,
    };
  });
  const isAllRunning = timers.every((timer) => timer.status === 'running');
  const result = {
    show: `${
      isAllRunning
        ? `${timers.map((timer) => timer.clock).join(' and ')} left`
        : parts.map((part) => part.show).join(' · ')
    }${more > 0 ? ` · and ${more} more` : ''}`,
    speak: `${parts.map((part) => part.speak).join(' ')}${more > 0 ? ` And ${more} more.` : ''}`,
  };
  return result;
};

/** The answer to "how much garlic": each name once with its amounts (a name on two lines has both, each with its group when the recipe groups them), shown as written and said in words. */
export const describeAmounts = (
  rows: { name: string; amountText: string; groupLabel?: string | null }[],
) => {
  const byName = rows.reduce((names, row) => {
    names.set(row.name, [...(names.get(row.name) ?? []), row]);
    return names;
  }, new Map<string, typeof rows>());
  const entries = [...byName.entries()];
  const result = {
    show: entries
      .map(
        ([name, lines]) =>
          `${name}: ${lines
            .map((line) =>
              line.groupLabel
                ? `${line.amountText} (${line.groupLabel})`
                : line.amountText,
            )
            .join(', ')}`,
      )
      .join('; '),
    speak: `${entries
      .map(
        ([name, lines]) =>
          `${name}, ${lines
            .map((line) =>
              line.groupLabel
                ? `${toSpokenAmount(line.amountText)}, ${line.groupLabel}`
                : toSpokenAmount(line.amountText),
            )
            .join(', plus ')}`,
      )
      .join('. ')}.`,
  };
  return result;
};

const isSooner = (
  timer: { remainingMs: number; endedAt?: number },
  than: { remainingMs: number; endedAt?: number },
) =>
  timer.remainingMs < than.remainingMs ||
  (timer.remainingMs === than.remainingMs &&
    (timer.endedAt ?? Infinity) < (than.endedAt ?? Infinity));

export interface VoiceTimerLike {
  id: string;
  label: string;
  status: string;
  remainingMs: number;
  endedAt?: number;
  names: string[];
}

export type VoiceTimerResolution<T> =
  | { kind: 'NONE' }
  | { kind: 'ONE'; timer: T }
  /** Every timer the person named with "all". */
  | { kind: 'ALL'; timers: T[] }
  /** More than one fits and nothing says which: the screen asks. */
  | { kind: 'ASK'; timers: T[] };

/** The timer a spoken command means, among those in the given states. A named or timed one is found by that; with none said, the one in front on screen, a Time's up (the one that rang first), or the only one that fits; when several fit and nothing tells them apart it asks instead of guessing. */
export const resolveVoiceTimers = <T extends VoiceTimerLike>(
  timers: T[],
  {
    statuses,
    target,
    focusedId,
  }: {
    statuses: string[];
    target: CookTimerTarget;
    focusedId: string | null;
  },
): VoiceTimerResolution<T> => {
  const pool = timers.filter((timer) => statuses.includes(timer.status));
  if (target.isAll) {
    return pool.length === 0 ? { kind: 'NONE' } : { kind: 'ALL', timers: pool };
  }
  const label = target.seconds === null ? null : formatDuration(target.seconds);
  const byLength =
    label === null ? pool : pool.filter((t) => t.label === label);
  const matched =
    target.name === null ? byLength : matchByName(target.name, byLength);
  if (matched.length === 0) return { kind: 'NONE' };
  if (matched.length === 1) return { kind: 'ONE', timer: matched[0] };
  const isNamed = target.seconds !== null || target.name !== null;
  const inFront = isNamed
    ? undefined
    : matched.find((timer) => timer.id === focusedId);
  if (inFront) return { kind: 'ONE', timer: inFront };
  const firstRang = matched
    .filter((timer) => timer.status === 'done')
    .reduce<T | null>(
      (first, timer) =>
        first === null || isSooner(timer, first) ? timer : first,
      null,
    );
  return firstRang
    ? { kind: 'ONE', timer: firstRang }
    : { kind: 'ASK', timers: matched };
};

const ASK_LIST_NAMES = 4;
const DISJUNCTION = new Intl.ListFormat('en-US', { type: 'disjunction' });

/** What a timer is called when several are listed side by side: its name, with its length after it when two share a name. */
export const getTimerChoiceNames = (
  timers: { name: string; label: string }[],
) =>
  timers.map((timer) =>
    timers.filter((other) => other.name === timer.name).length > 1
      ? `${timer.name} (${timer.label})`
      : timer.name,
  );

/** The question that asks which timer is meant: up to four names, then "N more", in the order "the second one" counts them. */
export const describeTimerQuestion = (
  timers: { name: string; label: string }[],
  verb: string,
) => {
  const names = getTimerChoiceNames(timers);
  const shown = names.slice(
    0,
    ASK_LIST_NAMES - 1 + (names.length === ASK_LIST_NAMES ? 1 : 0),
  );
  const hidden = names.length - shown.length;
  const list = DISJUNCTION.format(
    hidden > 0 ? [...shown, `${hidden} more`] : shown,
  );
  return {
    show: `Which timer to ${verb}: ${list}?`,
    speak: `Which timer should I ${verb}? ${list}?`,
  };
};

/** The timers "how much time is left" answers about: the one in focus (else the one that rang first, else the soonest running, else a paused one), then the soonest other running timer, if any. */
export const pickTimersToTell = <
  T extends {
    id: string;
    status: string;
    remainingMs: number;
    endedAt?: number;
  },
>(
  timers: T[],
  focusedId: string | null,
): T[] => {
  const running = timers
    .filter((timer) => timer.status === 'running')
    .sort((a, b) => a.remainingMs - b.remainingMs);
  const firstRang = timers
    .filter((timer) => timer.status === 'done')
    .reduce<T | null>(
      (first, timer) =>
        first === null || isSooner(timer, first) ? timer : first,
      null,
    );
  const first =
    timers.find((timer) => timer.id === focusedId) ??
    firstRang ??
    running[0] ??
    timers.find((timer) => timer.status === 'paused') ??
    null;
  if (first === null) return [];
  const other = running.find((timer) => timer.id !== first.id);
  const result = other ? [first, other] : [first];
  return result;
};

/** Whether a deadline is still ahead, read when a command runs (not during render). */
export const isBeforeDeadline = (deadline: number) => Date.now() < deadline;

/** Each timer with the time it has left right now, for answering a spoken command. */
export const withTimeLeft = <T>(
  timers: T[],
  getRemainingMs: (timer: T, now: number) => number,
) => {
  const now = Date.now();
  const result = timers.map((timer) => ({
    ...timer,
    remainingMs: getRemainingMs(timer, now),
  }));
  return result;
};
