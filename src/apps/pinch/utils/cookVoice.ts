import { findDurations } from '@/utils/durationUtils';

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

export type CookCommand =
  | { kind: 'NEXT' }
  | { kind: 'BACK' }
  | { kind: 'REPEAT' }
  | { kind: 'SHOW_INGREDIENTS' }
  | { kind: 'SHOW_STEPS' }
  | { kind: 'FINISH' }
  | { kind: 'START_TIMER'; seconds: number | null }
  | { kind: 'PAUSE_TIMER'; seconds: number | null }
  | { kind: 'RESUME_TIMER'; seconds: number | null }
  | { kind: 'STOP_TIMER'; seconds: number | null; scope: CookTimerScope }
  | { kind: 'TIME_LEFT' }
  | { kind: 'AMOUNT'; query: string; lineIds: string[] }
  | { kind: 'SWITCH_RECIPE'; recipeId: string | null; candidates: string[] }
  | { kind: 'CYCLE_RECIPE'; direction: 1 | -1 }
  | { kind: 'STOP_LISTENING' };

export interface CookVoiceContext {
  /** The recipes on screen, in plate order; one for a single recipe. */
  recipes: { id: string; title: string }[];
  shownRecipeId: string;
  /** The shown recipe's lines with every name each goes by; `isInStep` marks the lines the shown step names. */
  lines: { id: string; names: string[]; isInStep: boolean }[];
}

type PlainKind =
  | 'NEXT'
  | 'BACK'
  | 'REPEAT'
  | 'SHOW_INGREDIENTS'
  | 'SHOW_STEPS'
  | 'FINISH'
  | 'TIME_LEFT'
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
  FINISH: [
    'finish',
    'done',
    'im done',
    'i am done',
    'mark as cooked',
    'mark it as cooked',
  ],
  TIME_LEFT: [
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
  /^(?:(?:ok|okay|hey|hi|pinch|alright|all right|so|um|uh|er|please|lets|can you|could you|would you)\s+)+/;
const TAIL = /\s+(?:please|thanks|thank you|now)$/;
const TIMER_SUFFIX =
  / (?:on|for|in|until|till) (?:the |my |this )?(?:[a-z0-9 ]+ )?(?:timer|timers|clock)$/;

type TimerVerb = 'START' | 'PAUSE' | 'RESUME' | 'STOP';

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

const TIMER_PATTERN = new RegExp(
  String.raw`^(?<verb>${Object.keys(TIMER_VERBS).join('|')})(?: (?:the|a|my|that|this)(?= ))?(?: (?<length>.+?))??(?: (?<noun>timers?|alarms?|countdown))?(?: (?:for|of) (?<forLength>.+?))?(?: again)?$`,
);

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

/** Lower case, accents and punctuation off, apostrophes dropped and spaces single: what phrases are compared as. */
export const toPlainText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/(\d)\.(\d)/g, '$1#$2')
    .replace(/[^\p{L}\p{N}#\s]/gu, ' ')
    .replace(/#/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

/** Lower case, accents and punctuation off, and a leading "okay", "hey" or "pinch" and a trailing "please" dropped. */
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
const matchByName = <T extends { id: string; names: string[] }>(
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

const parseTimer = (text: string): CookCommand | null => {
  const groups = text.match(TIMER_PATTERN)?.groups;
  if (!groups) return null;
  const verb = TIMER_VERBS[groups.verb];
  const noun = groups.noun ?? null;
  const lengthText = groups.length ?? groups.forLength ?? null;
  if (groups.length && groups.forLength) return null;
  if (
    noun === null &&
    (lengthText !== null || !BARE_TIMER_VERBS.has(groups.verb))
  )
    return null;
  const seconds = lengthText === null ? null : readSpokenDuration(lengthText);
  if (lengthText !== null && seconds === null) return null;
  if (verb === 'START') return { kind: 'START_TIMER', seconds };
  if (verb === 'PAUSE') return { kind: 'PAUSE_TIMER', seconds };
  if (verb === 'RESUME') return { kind: 'RESUME_TIMER', seconds };
  const isAlarm = noun === null || noun.startsWith('alarm');
  return {
    kind: 'STOP_TIMER',
    seconds,
    scope: isAlarm && seconds === null ? 'RINGING' : 'ANY',
  };
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
  if (EXACT.get(text.replace(TIMER_SUFFIX, '')) === 'TIME_LEFT') {
    return { kind: 'TIME_LEFT' };
  }
  const direction = CYCLE_PHRASES[text];
  if (direction !== undefined) return { kind: 'CYCLE_RECIPE', direction };
  const result =
    parseTimer(text) ??
    parseAmount(text, context) ??
    parseSwitch(text, context);
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
  const spokenLabel = toSpokenLabel(timer.label);
  if (timer.status === 'done') {
    return {
      show: `The ${timer.label} timer is done`,
      speak: `The ${spokenLabel} timer is done.`,
    };
  }
  const isPaused = timer.status === 'paused';
  return {
    show: `${timer.clock} left on the ${timer.label} timer${isPaused ? ' (paused)' : ''}`,
    speak: `${formatSpokenTime(timer.remainingMs)} left on the ${spokenLabel} timer.${isPaused ? " It's paused." : ''}`,
  };
};

/** The answer to "how much time is left": a line to show (the clocks only, since the pills name the timers) and a sentence to say, naming each timer only when there are several. */
export const describeTimersLeft = (timers: VoiceTimerState[]) => {
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
    show: isAllRunning
      ? `${timers.map((timer) => timer.clock).join(' and ')} left`
      : parts.map((part) => part.show).join(' · '),
    speak: parts.map((part) => part.speak).join(' '),
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

/** The timer a spoken command means: the one in focus when it fits, else the one that ends soonest (with the said length, in the given states); null when none fits. */
export const pickVoiceTimer = <
  T extends {
    id: string;
    label: string;
    status: string;
    remainingMs: number;
    endedAt?: number;
  },
>(
  timers: T[],
  {
    statuses,
    label,
    focusedId,
  }: {
    statuses: T['status'][];
    label: string | null;
    focusedId: string | null;
  },
): T | null => {
  const candidates = timers.filter(
    (timer) =>
      statuses.includes(timer.status) &&
      (label === null || timer.label === label),
  );
  const result =
    candidates.find((timer) => timer.id === focusedId) ??
    candidates.reduce<T | null>(
      (soonest, timer) =>
        soonest === null || isSooner(timer, soonest) ? timer : soonest,
      null,
    );
  return result;
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
