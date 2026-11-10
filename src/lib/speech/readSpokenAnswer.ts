import { createOptionMatcher, toComparable } from '@/utils/optionMatchUtils';

export interface SpokenQuestionOption {
  id: string;
  label: string;
  detail: string | null;
  /** Other ways to name the option out loud. */
  aliases?: readonly string[];
  /** A closing option the question adds ("someone new"): named by its words, never counted by "the first". */
  isClosing?: boolean;
}

export interface SpokenQuestion {
  shape:
    | 'pickOne'
    | 'pickSeveral'
    | 'yesNo'
    | 'freeText'
    | 'dateTime'
    | 'pickRecord'
    | 'number';
  options: readonly SpokenQuestionOption[];
  /** The option "none of these" answers with. */
  noneOptionId: string | null;
  /** Whether a pick-one lets "something else: …" through as its own words. */
  allowsSomethingElse: boolean;
  /** `isMoney` answers in cents; `min` and `max` are in the unit the answer is given in. */
  number: { min: number | null; max: number | null; isMoney: boolean } | null;
  dateMode: 'date' | 'time' | 'dateTime' | null;
}

export type SpokenAnswerValue =
  | { shape: 'pickOne'; optionId: string; otherText: string | null }
  | { shape: 'yesNo'; optionId: string; otherText: string | null }
  | { shape: 'pickSeveral'; optionIds: string[] }
  | { shape: 'freeText'; text: string }
  | { shape: 'dateTime'; date: number | null; time: string | null }
  | { shape: 'pickRecord'; optionId: string }
  | { shape: 'number'; value: number };

export type SpokenAnswer =
  { kind: 'skip' } | { kind: 'answer'; value: SpokenAnswerValue };

export interface ReadSpokenAnswerOptions {
  /** Reads a date and a time out of words; the caller owns how a day is meant ("Friday"). `date` is UTC midnight, `time` a floating "HH:mm". */
  readDate?: (
    text: string,
  ) => { date: number | null; time: string | null } | null;
}

const FREE_TEXT_MAX = 500;
const YES = new Set([
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'ok',
  'okay',
  'correct',
  'absolutely',
  'of course',
  'please do',
  'do it',
  'yes please',
  'sure thing',
]);
const NO = new Set([
  'no',
  'nope',
  'nah',
  'no thanks',
  'no thank you',
  'not really',
  'dont',
  "don't",
  'do not',
]);
const SKIPS = new Set([
  'skip',
  'skip it',
  'skip this',
  'skip that',
  'skip this one',
  'skip this question',
  'pass',
]);
const NONE_PHRASES = [
  'none',
  'none of these',
  'none of them',
  'none of the above',
  'neither',
  'nothing',
  'nobody',
  'no one',
];
const FILLER = new Set([
  'i',
  'id',
  "i'd",
  'ill',
  "i'll",
  'would',
  'like',
  'want',
  'pick',
  'choose',
  'take',
  'select',
  'go',
  'with',
  'please',
  'um',
  'uh',
  'the',
  'my',
  'lets',
  "let's",
  'do',
]);
const ORDINALS: Record<string, number> = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
  seventh: 6,
  eighth: 7,
  '1st': 0,
  '2nd': 1,
  '3rd': 2,
  '4th': 3,
  '5th': 4,
  '6th': 5,
  '7th': 6,
  '8th': 7,
  last: -1,
};
const UNITS: Record<string, number> = {
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
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000 };

/** What was said as plain lower-case words: commas inside numbers and the dollar sign dropped, other punctuation turned to spaces. */
const toWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/(\d),(?=\d{3})/g, '$1')
    .replace(/\$/g, ' ')
    .replace(/[^a-z0-9.'\s]/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripFiller = (words: string): string =>
  FILLER.has(words.split(' ')[0]) && words.includes(' ')
    ? stripFiller(words.slice(words.indexOf(' ') + 1))
    : words.replace(/ please$/, '');

const isDigits = (token: string | undefined) =>
  token !== undefined && /^\d+(\.\d+)?$/.test(token);

const isNumberWord = (token: string | undefined) =>
  token !== undefined && (token in UNITS || token in TENS || token in SCALES);

const foldNumberWords = (words: string[]) => {
  const { total, current } = words.reduce(
    (acc, word) => {
      if (word === 'a' || word === 'and') return acc;
      if (word in SCALES) {
        return SCALES[word] === 100
          ? { total: acc.total, current: (acc.current || 1) * 100 }
          : {
              total: acc.total + (acc.current || 1) * SCALES[word],
              current: 0,
            };
      }
      return { ...acc, current: acc.current + (UNITS[word] ?? TENS[word]) };
    },
    { total: 0, current: 0 },
  );
  return total + current;
};

const getRunEnd = (tokens: string[], from: number): number => {
  const token = tokens[from];
  const isStartOfScale =
    token === 'a' && from === 0 && tokens[from + 1] in SCALES;
  const isAndInside =
    token === 'and' &&
    from > 0 &&
    isNumberWord(tokens[from + 1]) &&
    tokens.slice(0, from).some((word) => word in SCALES);
  return isNumberWord(token) || isAndInside || isStartOfScale
    ? getRunEnd(tokens, from + 1)
    : from;
};

const readFraction = (
  tokens: string[],
  value: number,
  end: number,
): { value: number; end: number } => {
  if (
    tokens[end] === 'and' &&
    tokens[end + 1] === 'a' &&
    tokens[end + 2] === 'half'
  ) {
    return { value: value + 0.5, end: end + 3 };
  }
  if (tokens[end] === 'point') {
    const digits = tokens
      .slice(end + 1)
      .map((token) =>
        token in UNITS && UNITS[token] < 10 ? String(UNITS[token]) : token,
      )
      .filter((_, index, all) =>
        all.slice(0, index + 1).every((token) => /^\d$/.test(token)),
      );
    return digits.length === 0
      ? { value, end }
      : {
          value: Number(`${value}.${digits.join('')}`),
          end: end + 1 + digits.length,
        };
  }
  return { value, end };
};

/** The first number in what was said, in digits or words ("twenty five", "a hundred and two", "two and a half", "3.5"). */
const readNumber = (text: string): number | null => {
  const tokens = toWords(text).split(' ');
  const start = tokens.findIndex(
    (token, index) =>
      isDigits(token) ||
      isNumberWord(token) ||
      (token === 'a' && tokens[index + 1] in SCALES),
  );
  if (start === -1) return null;
  const run = tokens.slice(start);
  if (isDigits(run[0])) {
    return readFraction(run, Number(run[0]), 1).value;
  }
  const end = getRunEnd(run, 0);
  return readFraction(run, foldNumberWords(run.slice(0, end)), end).value;
};

const readMoneyCents = (text: string): number | null => {
  const words = toWords(text);
  const dollars = /^(.*?)\b(?:dollars?|bucks?)\b\s*(?:and\s+)?(.*)$/.exec(
    words,
  );
  const toCents = (cents: string) =>
    cents === '' ? 0 : /cents?$/.test(cents) ? readNumber(cents) : null;
  if (dollars) {
    const whole = readNumber(dollars[1]);
    const rest = toCents(dollars[2]);
    return whole === null || rest === null
      ? null
      : Math.round(whole * 100) + rest;
  }
  if (/\bcents?$/.test(words)) return readNumber(words);
  const amount = readNumber(words);
  return amount === null ? null : Math.round(amount * 100);
};

const readNumberAnswer = (
  text: string,
  config: NonNullable<SpokenQuestion['number']>,
): SpokenAnswer | null => {
  const value = config.isMoney ? readMoneyCents(text) : readNumber(text);
  const isInRange =
    value !== null &&
    Number.isFinite(value) &&
    (config.min === null || value >= config.min) &&
    (config.max === null || value <= config.max);
  return isInRange
    ? { kind: 'answer', value: { shape: 'number', value } }
    : null;
};

const readYesNo = (text: string): SpokenAnswer | null => {
  const words = toWords(text);
  const optionId = YES.has(words) ? 'yes' : NO.has(words) ? 'no' : null;
  return optionId === null
    ? null
    : {
        kind: 'answer',
        value: { shape: 'yesNo', optionId, otherText: null },
      };
};

const readDateAnswer = (
  text: string,
  mode: NonNullable<SpokenQuestion['dateMode']>,
  readDate: ReadSpokenAnswerOptions['readDate'],
): SpokenAnswer | null => {
  const read = readDate?.(text) ?? null;
  const isComplete =
    read !== null &&
    (mode === 'date'
      ? read.date !== null
      : mode === 'time'
        ? read.time !== null
        : read.date !== null && read.time !== null);
  return isComplete
    ? {
        kind: 'answer',
        value: {
          shape: 'dateTime',
          date: mode === 'time' ? null : read.date,
          time: mode === 'date' ? null : read.time,
        },
      }
    : null;
};

const SOMETHING_ELSE =
  /^(?:something else|something different|other|another one)\s*(?:[:,-]|\b(?:like|called|is|would be)\b)\s*(.+)$/is;

const readPicks = (text: string, question: SpokenQuestion): string[] | null => {
  const { options, noneOptionId } = question;
  const selectable = options.filter(
    (option) => !option.isClosing && option.id !== noneOptionId,
  );
  const tokensOf = (label: string) => toComparable(label).split(' ');
  const uniqueTokens = (option: SpokenQuestionOption) =>
    tokensOf(option.label).filter(
      (token) =>
        token !== '' &&
        selectable.every(
          (other) =>
            other.id === option.id || !tokensOf(other.label).includes(token),
        ),
    );
  const choices = [
    ...selectable.map((option) => ({
      id: option.id,
      names: [
        option.label,
        ...(option.aliases ?? []),
        ...uniqueTokens(option),
        ...(option.detail ? [option.detail] : []),
      ],
    })),
    ...options
      .filter((option) => option.isClosing || option.id === noneOptionId)
      .map((option) => ({
        id: option.id,
        names: [
          option.label,
          ...(option.aliases ?? []),
          ...(option.id === noneOptionId ? NONE_PHRASES : []),
        ],
      })),
  ];
  const matcher = createOptionMatcher<(typeof choices)[number]>({
    names: (choice) => choice.names,
    typos: false,
  });
  const ids = selectable.map((option) => option.id);
  const matchLabel = (words: string) => {
    const choice = matcher.match(words, choices);
    return choice ? [choice.id] : null;
  };
  const countOf = (word: string | undefined) =>
    word === undefined
      ? null
      : isDigits(word)
        ? Number(word)
        : word in UNITS
          ? UNITS[word]
          : null;
  const readPosition = (words: string): string[] | null => {
    const kept = words.replace(
      / (?:ones|options|choices|items|one|option|choice|item)$/,
      '',
    );
    const [head, second] = kept.split(' ');
    const parts = kept.split(' ');
    if (kept === 'both') return ids.length === 2 ? ids : null;
    if (
      /^(?:all|all of them|all of these|all of the above|everything|every one|each)$/.test(
        kept,
      )
    ) {
      return ids.length >= 2 ? ids : null;
    }
    if ((head === 'first' || head === 'last') && parts.length === 2) {
      const count = countOf(second);
      if (count === null || count < 1 || count > ids.length) return null;
      return head === 'first' ? ids.slice(0, count) : ids.slice(-count);
    }
    if (parts.length === 1 && head in ORDINALS) {
      const index = ORDINALS[head] === -1 ? ids.length - 1 : ORDINALS[head];
      return ids[index] === undefined ? null : [ids[index]];
    }
    if (parts.length === 2 && /^(?:number|option|choice|item|no)$/.test(head)) {
      const index = (countOf(second) ?? 0) - 1;
      return ids[index] === undefined ? null : [ids[index]];
    }
    return null;
  };
  const resolveWhole = (raw: string) =>
    matchLabel(raw) ??
    readPosition(stripFiller(toWords(raw))) ??
    matchLabel(stripFiller(toWords(raw)));
  const whole = resolveWhole(text);
  if (whole) return whole;
  if (question.shape === 'pickOne') return null;
  const resolved = text
    .split(/\s*(?:,|\band\b|\bplus\b|\bas well as\b|\balso\b)\s*/i)
    .filter((part) => toWords(part) !== '')
    .map(resolveWhole);
  if (resolved.length < 2 || resolved.some((part) => part === null))
    return null;
  const picked = new Set(resolved.flat() as string[]);
  return [...picked];
};

/** Reads a spoken answer to one asked question: "skip", yes or no, "the first two", "both", "none of these", an option by its words, a number or an amount in words, a date through the caller's reader, or words taken as said. Anything it can't place, or a value out of range, is `null`. English only. */
export function readSpokenAnswer(
  question: SpokenQuestion,
  transcript: string,
  options: ReadSpokenAnswerOptions = {},
): SpokenAnswer | null {
  const text = transcript.trim();
  if (text === '') return null;
  if (SKIPS.has(toWords(text))) return { kind: 'skip' };
  const answer = (value: SpokenAnswerValue): SpokenAnswer => ({
    kind: 'answer',
    value,
  });
  if (question.shape === 'yesNo') return readYesNo(text);
  if (question.shape === 'freeText') {
    return answer({ shape: 'freeText', text: text.slice(0, FREE_TEXT_MAX) });
  }
  if (question.shape === 'number') {
    return question.number ? readNumberAnswer(text, question.number) : null;
  }
  if (question.shape === 'dateTime') {
    return question.dateMode
      ? readDateAnswer(text, question.dateMode, options.readDate)
      : null;
  }
  const other = question.allowsSomethingElse ? SOMETHING_ELSE.exec(text) : null;
  if (question.shape === 'pickOne' && other) {
    return answer({
      shape: 'pickOne',
      optionId: 'other',
      otherText: other[1].trim().slice(0, FREE_TEXT_MAX),
    });
  }
  const picks = readPicks(text, question);
  if (picks === null || picks.length === 0) return null;
  const hasNone =
    question.noneOptionId !== null && picks.includes(question.noneOptionId);
  if (question.shape === 'pickSeveral') {
    return hasNone && picks.length > 1
      ? null
      : answer({ shape: 'pickSeveral', optionIds: picks });
  }
  if (picks.length !== 1) return null;
  return question.shape === 'pickRecord'
    ? answer({ shape: 'pickRecord', optionId: picks[0] })
    : answer({ shape: 'pickOne', optionId: picks[0], otherText: null });
}
