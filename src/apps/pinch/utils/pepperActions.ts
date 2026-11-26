import {
  readSpokenAnswer,
  type SpokenQuestion,
} from '@/lib/speech/readSpokenAnswer';
import {
  MAX_COOK_DICTATION_CHARS,
  MAX_COOK_SERVINGS,
  MAX_KITCHEN_TIMER_NAME,
  MAX_KITCHEN_TIMER_SECONDS,
  MIN_COOK_SERVINGS,
} from '@apps/pinch/constants';
import {
  NO_TIMER_TARGET,
  type CookCommand,
  type CookEntryKind,
  type CookTimerTarget,
} from '@apps/pinch/utils/cookVoice';

/** The cook commands a voice phrase or a tap already makes, which is all Pepper's tools that touch the cook screen reduce to. */
export type PepperCookCommand = Extract<
  CookCommand,
  {
    kind:
      | 'SHOW_INGREDIENTS'
      | 'SHOW_STEPS'
      | 'SHOW_TIMERS'
      | 'START_TIMER'
      | 'PAUSE_TIMER'
      | 'RESUME_TIMER'
      | 'STOP_TIMER'
      | 'EXTEND_TIMER'
      | 'SET_SERVINGS'
      | 'SHOW_ENTRIES'
      | 'GOT_INGREDIENT';
  }
>;

export interface PepperShoppingItem {
  name: string;
  amount: string | null;
}

/** What Pepper may ask the screen to do, checked: a tool's input never reaches an action as the model wrote it. */
export type PepperCommand =
  | { kind: 'cook'; command: PepperCookCommand }
  | { kind: 'go_to_step'; step: number }
  | {
      kind: 'add_entry';
      entryKind: CookEntryKind;
      text: string;
      step: number | null;
    }
  | { kind: 'edit_entry'; id: string; text: string }
  | { kind: 'remove_entry'; id: string }
  | { kind: 'add_to_shopping_list'; items: PepperShoppingItem[] }
  | { kind: 'undo_last' }
  /** Pepper judged the person done: the mic goes back to waiting once the reply has been said. */
  | { kind: 'end_conversation' }
  /** Finishing the cook is the person's own tap; nothing here ever runs it. */
  | { kind: 'finish' }
  /** A tool that exists but was asked something it can't do; `said` is the one line that tells the person. */
  | { kind: 'invalid'; said: string }
  | { kind: 'unknown' };

const MAX_NAMES = 20;
const MAX_NAME_CHARS = 60;
const MAX_SHOPPING_ITEMS = 20;
const MAX_ITEM_CHARS = 80;
const MAX_AMOUNT_CHARS = 40;
const MAX_ID_CHARS = 200;
const FINISH_NAMES = new Set(['finish', 'finish_cooking', 'mark_cooked']);
const ENTRY_KINDS = new Map<string, CookEntryKind>([
  ['note', 'NOTE'],
  ['tip', 'TIP'],
  ['change', 'CHANGE'],
]);
const SHOW_KINDS = new Map<string, PepperCookCommand>([
  ['ingredients', { kind: 'SHOW_INGREDIENTS' }],
  ['steps', { kind: 'SHOW_STEPS' }],
  ['timers', { kind: 'SHOW_TIMERS' }],
  ['notes', { kind: 'SHOW_ENTRIES', entryKind: 'NOTE' }],
  ['tips', { kind: 'SHOW_ENTRIES', entryKind: 'TIP' }],
  ['changes', { kind: 'SHOW_ENTRIES', entryKind: 'CHANGE' }],
]);
const ENTRY_WORDS: Record<CookEntryKind, string> = {
  TIP: 'tip',
  NOTE: 'note',
  CHANGE: 'change',
};
const QUOTE_CHARS = 40;

const invalid = (said: string): PepperCommand => ({ kind: 'invalid', said });
const cook = (command: PepperCookCommand): PepperCommand => ({
  kind: 'cook',
  command,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

/** Clipped at a word, as a dictated entry is. */
const clipText = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).trimEnd();
};

const readWholeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : null;

const readStep = (value: unknown) => {
  if (value === null || value === undefined)
    return { step: null as number | null, isBad: false };
  const step = readWholeNumber(value);
  return step === null || step < 1
    ? { step: null, isBad: true }
    : { step, isBad: false };
};

const readTarget = (name: unknown): CookTimerTarget => {
  const text = clipText(readText(name), MAX_KITCHEN_TIMER_NAME);
  return text === ''
    ? NO_TIMER_TARGET
    : { seconds: null, name: text, isAll: false };
};

const readTimer = (input: Record<string, unknown>): PepperCommand => {
  const target = readTarget(input.name);
  const seconds = readWholeNumber(input.seconds);
  const hasLength =
    seconds !== null && seconds >= 1 && seconds <= MAX_KITCHEN_TIMER_SECONDS;
  switch (input.action) {
    case 'start':
      if (input.seconds === null || input.seconds === undefined) {
        return target.name === null
          ? cook({ kind: 'START_TIMER', seconds: null, name: null })
          : invalid('How long should that timer run?');
      }
      return hasLength
        ? cook({ kind: 'START_TIMER', seconds, name: target.name })
        : invalid("I can't set a timer for that long.");
    case 'pause':
      return cook({ kind: 'PAUSE_TIMER', target });
    case 'resume':
      return cook({ kind: 'RESUME_TIMER', target });
    case 'stop':
      return cook({ kind: 'STOP_TIMER', target, scope: 'ANY' });
    case 'add_time':
      return hasLength
        ? cook({ kind: 'EXTEND_TIMER', seconds, target })
        : invalid('How much time should I add?');
    default:
      return { kind: 'unknown' };
  }
};

const readServings = (value: unknown): PepperCommand => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return invalid("I didn't catch how many servings.");
  }
  const servings = Math.round(value * 100) / 100;
  if (servings < MIN_COOK_SERVINGS) {
    return invalid('Half a serving is the least I can make it.');
  }
  if (servings > MAX_COOK_SERVINGS) {
    return invalid(`${MAX_COOK_SERVINGS} servings is the most.`);
  }
  return cook({ kind: 'SET_SERVINGS', change: { kind: 'TO', servings } });
};

const readTicks = (input: Record<string, unknown>): PepperCommand => {
  const queries = (Array.isArray(input.names) ? input.names : [])
    .map((name) => clipText(readText(name), MAX_NAME_CHARS))
    .filter((name) => name !== '')
    .slice(0, MAX_NAMES);
  if (queries.length === 0 || typeof input.got !== 'boolean') {
    return invalid("I didn't catch which ingredients.");
  }
  return cook({ kind: 'GOT_INGREDIENT', queries, isOut: input.got });
};

const readAddEntry = (input: Record<string, unknown>): PepperCommand => {
  const entryKind =
    typeof input.kind === 'string' ? ENTRY_KINDS.get(input.kind) : undefined;
  const text = clipText(readText(input.text), MAX_COOK_DICTATION_CHARS);
  const { step, isBad } = readStep(input.step);
  if (entryKind === undefined || text === '' || isBad) {
    return invalid("I didn't catch what to write down.");
  }
  return { kind: 'add_entry', entryKind, text, step };
};

const readEntryId = (value: unknown) =>
  typeof value === 'string' && value.length <= MAX_ID_CHARS ? value.trim() : '';

const readShopping = (input: Record<string, unknown>): PepperCommand => {
  const items = (Array.isArray(input.items) ? input.items : [])
    .slice(0, MAX_SHOPPING_ITEMS)
    .flatMap((item): PepperShoppingItem[] => {
      if (!isRecord(item)) return [];
      const name = clipText(readText(item.name), MAX_ITEM_CHARS);
      const amount = clipText(readText(item.amount), MAX_AMOUNT_CHARS);
      return name === ''
        ? []
        : [{ name, amount: amount === '' ? null : amount }];
    });
  return items.length === 0
    ? invalid("I didn't catch what to add.")
    : { kind: 'add_to_shopping_list', items };
};

/** Checks a tool call from Pepper and turns it into the command the screen runs, mapping onto the cook commands a voice phrase or a tap already makes wherever one exists. An input outside what the tool allows is refused with a line to say, and a tool the app doesn't have is `unknown`. */
export const readPepperAction = (action: {
  name: string;
  input: unknown;
}): PepperCommand => {
  if (FINISH_NAMES.has(action.name)) return { kind: 'finish' };
  const input = isRecord(action.input) ? action.input : {};
  switch (action.name) {
    case 'go_to_step': {
      const step = readWholeNumber(input.step);
      return step === null || step < 1
        ? invalid("I didn't catch which step.")
        : { kind: 'go_to_step', step };
    }
    case 'timer':
      return readTimer(input);
    case 'set_servings':
      return readServings(input.servings);
    case 'show': {
      const shown =
        typeof input.what === 'string' ? SHOW_KINDS.get(input.what) : undefined;
      return shown === undefined
        ? invalid("I'm not sure what to show.")
        : cook(shown);
    }
    case 'tick_ingredients':
      return readTicks(input);
    case 'add_entry':
      return readAddEntry(input);
    case 'edit_entry': {
      const id = readEntryId(input.id);
      const text = clipText(readText(input.text), MAX_COOK_DICTATION_CHARS);
      return id === '' || text === ''
        ? invalid("I didn't catch what to change it to.")
        : { kind: 'edit_entry', id, text };
    }
    case 'remove_entry': {
      const id = readEntryId(input.id);
      return id === ''
        ? invalid("I'm not sure which one to remove.")
        : { kind: 'remove_entry', id };
    }
    case 'add_to_shopping_list':
      return readShopping(input);
    case 'undo_last':
      return { kind: 'undo_last' };
    case 'end_conversation':
      return { kind: 'end_conversation' };
    default:
      return { kind: 'unknown' };
  }
};

/** The question asked before a removal, quoting the entry so a misheard one is caught. */
export const askToRemoveEntry = (entryKind: CookEntryKind, text: string) =>
  `Remove the ${ENTRY_WORDS[entryKind]} “${clipText(text, QUOTE_CHARS)}”?`;

export const getEntryWord = (entryKind: CookEntryKind) =>
  ENTRY_WORDS[entryKind];

const CONFIRM_QUESTION: SpokenQuestion = {
  shape: 'yesNo',
  options: [],
  noneOptionId: null,
  allowsSomethingElse: false,
  number: null,
  dateMode: null,
};

const BACK_OFF = new Set([
  'never mind',
  'nevermind',
  'cancel',
  'forget it',
  'leave it',
  'keep it',
]);

/** How long a removal waits for its yes. */
const CONFIRM_MS = 60_000;

/** The one removal waiting on a yes: a new question or a new removal replaces it, and an answer takes it once. */
export const createRemovalWait = () => {
  const wait = { id: null as string | null, at: 0 };
  const isLive = (now: number) =>
    wait.id !== null && now - wait.at <= CONFIRM_MS;
  return {
    ask: (id: string, now: number) => {
      wait.id = id;
      wait.at = now;
    },
    clear: () => {
      wait.id = null;
    },
    isWaiting: isLive,
    take: (now: number) => {
      const id = isLive(now) ? wait.id : null;
      wait.id = null;
      return id;
    },
  };
};

/** What the person said to "Remove …?": yes, no ("never mind" and "skip" count as no), or null when it was neither, so it goes to Pepper as a new turn. */
export const readConfirmAnswer = (heard: string): 'yes' | 'no' | null => {
  if (
    BACK_OFF.has(
      heard
        .toLowerCase()
        .replace(/[^a-z ]/g, '')
        .trim(),
    )
  ) {
    return 'no';
  }
  const answer = readSpokenAnswer(CONFIRM_QUESTION, heard);
  if (answer === null) return null;
  if (answer.kind === 'skip') return 'no';
  return answer.value.shape === 'yesNo' && answer.value.optionId === 'yes'
    ? 'yes'
    : 'no';
};
