export type TurnLogKind =
  /** Words the recognizer finished, with its guesses. */
  | 'heard'
  /** What a heard phrase became, or why it became nothing. */
  | 'routed'
  /** A question sent to the assistant. */
  | 'request'
  | 'latency'
  | 'note'
  /** The assistant's whole reply as the server returned it. */
  | 'reply'
  /** One line said aloud, with the voice that said it. */
  | 'spoken'
  | 'action'
  | 'done'
  | 'held'
  | 'failed'
  | 'error';

export type TurnLogValue =
  | string
  | number
  | boolean
  | null
  | TurnLogValue[]
  | { [key: string]: TurnLogValue };

export type TurnLogData = Record<string, TurnLogValue>;

export interface TurnLogEntry {
  at: number;
  kind: TurnLogKind;
  text: string;
  data: TurnLogData | null;
}

const KEPT = 300;
const MAX_TEXT_CHARS = 1200;
const KEY = 'speech:turn-log';
const OWNER_KEY = 'speech:turn-log-owner';

const KINDS: TurnLogKind[] = [
  'heard',
  'routed',
  'request',
  'latency',
  'note',
  'reply',
  'spoken',
  'action',
  'done',
  'held',
  'failed',
  'error',
];

const isEntry = (value: unknown): value is TurnLogEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<TurnLogEntry>;
  return (
    typeof entry.at === 'number' &&
    typeof entry.text === 'string' &&
    KINDS.includes(entry.kind as TurnLogKind) &&
    (entry.data === null || typeof entry.data === 'object')
  );
};

const readKept = (): TurnLogEntry[] => {
  try {
    const kept: unknown = JSON.parse(
      window.sessionStorage.getItem(KEY) ?? '[]',
    );
    return Array.isArray(kept) ? kept.filter(isEntry).slice(-KEPT) : [];
  } catch {
    return [];
  }
};

const store = {
  entries: typeof window === 'undefined' ? [] : readKept(),
  isRecording: false,
  listeners: new Set<() => void>(),
};

const save = () => {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(store.entries));
  } catch {
    // Kept for this page only, so a reload loses it.
  }
};

const notify = () => store.listeners.forEach((listener) => listener());

const clip = (text: string) =>
  text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text;

const clipValue = (value: TurnLogValue): TurnLogValue => {
  if (typeof value === 'string') return clip(value);
  if (Array.isArray(value)) return value.map(clipValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, clipValue(inner)]),
    );
  }
  return value;
};

/** Turns recording on for a viewer who may see the log; nothing is recorded while it is off. */
export const setTurnLogRecording = (isRecording: boolean) => {
  store.isRecording = isRecording;
};

/** Notes one event of a spoken conversation, for the debug viewers' log. Never pass a token or any secret in `text` or `data`. */
export const recordTurn = (
  kind: TurnLogKind,
  text: string,
  data: TurnLogData | null = null,
) => {
  if (!store.isRecording) return;
  const entry: TurnLogEntry = {
    at: Date.now(),
    kind,
    text: clip(text),
    data: data === null ? null : (clipValue(data) as TurnLogData),
  };
  store.entries = [...store.entries, entry].slice(-KEPT);
  save();
  notify();
};

export const clearTurnLog = () => {
  store.entries = [];
  save();
  notify();
};

/** Keeps the log for one signed-in person: a different one, or nobody, starts it empty (the log holds what someone said and what was done for them). */
export const claimTurnLog = (uid: string | null) => {
  try {
    const owner = window.sessionStorage.getItem(OWNER_KEY);
    if (owner === uid) return;
    if (uid === null) window.sessionStorage.removeItem(OWNER_KEY);
    else window.sessionStorage.setItem(OWNER_KEY, uid);
  } catch {
    // Without storage the log lives for this page only, so nothing outlives the person.
  }
  clearTurnLog();
};

/** Calls back whenever the log changes, for `useSyncExternalStore`. */
export const subscribeTurnLog = (listener: () => void) => {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
};

/** The last 300 events, oldest first, kept across a reload; a new array each time the log changes. */
export const readTurnLog = () => store.entries;

const formatClock = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const formatValue = (value: TurnLogValue): string => {
  if (typeof value === 'string') {
    return /[\s,=]/.test(value) || value === '' ? JSON.stringify(value) : value;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '(none)' : value.map(formatValue).join(' | ');
  }
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const formatData = (data: TurnLogData | null) =>
  data === null || Object.keys(data).length === 0
    ? ''
    : `  [${Object.entries(data)
        .map(([key, value]) => `${key}: ${formatValue(value)}`)
        .join(', ')}]`;

/** The log as plain text to paste: the `header` lines, then the events grouped by phrase heard (each `heard` starts a turn), one line per event with its time as mm:ss from the first event. */
export const formatTurnLog = (
  entries: TurnLogEntry[],
  header: string[] = [],
) => {
  const first = entries[0]?.at ?? 0;
  const lines = entries.flatMap((entry, index) => {
    const turnLabel =
      entry.kind === 'heard'
        ? `\n── Turn ${entries.slice(0, index + 1).filter((candidate) => candidate.kind === 'heard').length} ──`
        : index === 0
          ? '\n── Before the first phrase ──'
          : null;
    return [
      ...(turnLabel === null ? [] : [turnLabel]),
      `${formatClock(entry.at - first)}  ${entry.kind.padEnd(7)} ${entry.text}${formatData(entry.data)}`,
    ];
  });
  return [
    ...header,
    `Events: ${entries.length}`,
    ...(entries.length === 0
      ? ['', 'Nothing recorded yet.']
      : [`Started: ${new Date(first).toLocaleString()}`, ...lines]),
  ].join('\n');
};

export interface TurnLogRunning {
  /** What is expected to listen, for before any phrase was heard. */
  listening: string;
  /** What is expected to speak, for before any line was said. */
  voice: string;
  /** What is expected to answer, for before any reply came. */
  answers: string;
}

const STAND_IN_ANSWER = 'stand-in reply (no Anthropic key on the server)';

const distinct = (values: string[]) => [...new Set(values)];

const describeUse = (values: string[], fallback: string) => {
  const used = distinct(values);
  const latest = values.at(-1);
  return latest === undefined
    ? fallback
    : used.length === 1
      ? latest
      : `${latest} (latest), earlier ${used.filter((value) => value !== latest).join(', ')}`;
};

const readText = (entry: TurnLogEntry, key: string) => {
  const value = entry.data?.[key];
  return typeof value === 'string' ? value : null;
};

/** What actually ran, in plain words, read from the events themselves: the `listener` of each `heard`, the `voice` of each `spoken` with `why` it was not the best one beside it, the `model` of each `done`. The expected values stand in until an event has said. */
export const describeRunning = (
  entries: TurnLogEntry[],
  expected: TurnLogRunning,
): string[] => {
  const heard = entries.filter((entry) => entry.kind === 'heard');
  const spoken = entries.filter((entry) => entry.kind === 'spoken');
  const answered = entries.filter((entry) => entry.kind === 'done');
  const voice = describeUse(
    spoken.flatMap((entry) => {
      const name = readText(entry, 'voice');
      const why = readText(entry, 'why');
      return name === null ? [] : `${name}${why === null ? '' : ` (${why})`}`;
    }),
    expected.voice,
  );
  return [
    `Listening: ${describeUse(
      heard.flatMap((entry) => readText(entry, 'listener') ?? []),
      expected.listening,
    )}`,
    `Voice: ${voice}`,
    `Answers: ${describeUse(
      answered.map((entry) =>
        entry.data?.isStandIn === true
          ? STAND_IN_ANSWER
          : (readText(entry, 'model') ?? 'model not reported by the server'),
      ),
      expected.answers,
    )}`,
  ];
};
