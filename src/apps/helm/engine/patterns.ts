import { sha256Hex } from '@/utils/sha256';
import {
  dayKeyToMs as toMs,
  isDueOn,
  shiftDayKeyBy as shiftKey,
  type Cadence,
  type Weekday,
} from '@/utils/cadenceUtils';
import {
  formatClockTime,
  formatDateShortUTC,
  formatList,
} from '@/utils/formatUtils';
import {
  HELM_COPY,
  PATTERN_BACKOFF_WEEKS,
  PATTERN_THRESHOLDS,
} from '@apps/helm/constants';
import {
  habitDayKey,
  readPauseSpans,
  toAllowedWindow,
  type ClockWindow,
  type DayPart,
} from '@apps/helm/engine/habitDay';
import {
  readLastStartKey,
  readWeekKey,
  type LifeDay,
  type LifeHabit,
} from '@apps/helm/engine/habitLife';
import {
  readSaidSignals,
  type ObservationTag,
  type SaidObservation,
} from '@apps/helm/engine/said';
import type {
  Pattern,
  PatternBucket,
  PatternEffect,
  PatternEvidence,
  PatternHandling,
  PatternKind,
  PatternState,
  ReflectionLink,
  ReflectionSealed,
} from '@apps/helm/types';

export type PatternFamily = 'noticed' | 'habitLife' | 'guardrail';

export const patternFamily = (kind: PatternKind): PatternFamily =>
  kind === 'habitFormed' || kind === 'reminderEase'
    ? 'habitLife'
    : kind === 'tooManyGoals' ||
        kind === 'deadlineWontFit' ||
        kind === 'starved' ||
        kind === 'busyStretch'
      ? 'guardrail'
      : 'noticed';

const DAY_MS = 86_400_000;
const HALF_HOUR = 30;
const DAY_MINUTES = 24 * 60;
const ROLLOVER_MINUTES = 3 * 60;

type Subject = Pattern['subject'];

const bucketKey = (bucket: PatternBucket) =>
  bucket.kind === 'weekdayPart'
    ? `weekdayPart:${bucket.weekday}:${bucket.part}`
    : bucket.kind === 'shift'
      ? `shift:${bucket.relation}:${bucket.part}`
      : bucket.kind === 'stretch'
        ? `stretch:${bucket.from}:${bucket.to}`
        : 'none';

/** The same thing is always one record: ids and enums only, never words. `parts` are the extra enums a kind separates itself by (a side, the tags of a link). */
export const patternSignature = (input: {
  kind: PatternKind;
  subject: Subject;
  bucket: PatternBucket;
  parts?: string[];
}) =>
  [
    input.kind,
    input.subject.collection,
    input.subject.id ?? '',
    input.subject.windowId ?? '',
    input.subject.otherId ?? '',
    bucketKey(input.bucket),
    [...(input.parts ?? [])].sort().join('+'),
  ].join('|');

/** `pt_` and the first 24 hex of the signature's sha256, so two devices write one document. */
export function patternId(signature: string): string {
  return `pt_${sha256Hex(signature).slice(0, 24)}`;
}

/** Set by code from the kind and the subject, never by the model. */
export function readHandling(
  kind: PatternKind,
  subject: Pick<Subject, 'collection'>,
  isCare: boolean,
): PatternHandling {
  if (isCare || kind === 'reminderEase') return 'askOnly';
  return kind === 'plannedSlotMissed' && subject.collection === 'planner'
    ? 'actAndTell'
    : 'suggest';
}

export interface PatternFinding {
  kind: PatternKind;
  subject: Subject;
  bucket: PatternBucket;
  signature: string;
  parts: string[];
  evidence: PatternEvidence;
  effect: PatternEffect;
  handling: PatternHandling;
  isCare: boolean;
  tags: ObservationTag[];
  linkedTo: ReflectionLink | null;
  /** The newest instant that counted. */
  lastEvidenceAt: number;
}

const toFinding = (
  input: Omit<PatternFinding, 'signature' | 'handling' | 'tags' | 'linkedTo'> &
    Partial<Pick<PatternFinding, 'tags' | 'linkedTo'>>,
): PatternFinding => ({
  tags: [],
  linkedTo: null,
  ...input,
  effect: input.isCare ? { kind: 'none' } : input.effect,
  signature: patternSignature(input),
  handling: readHandling(input.kind, input.subject, input.isCare),
});

const weekdayOf = (dayKey: string) =>
  new Date(toMs(dayKey)).getUTCDay() as Weekday;

const toMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const toClock = (minutes: number) => {
  const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

const afterRollover = (minutes: number) =>
  minutes < ROLLOVER_MINUTES ? minutes + DAY_MINUTES : minutes;

const localMinutes = (at: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return afterRollover(read('hour') * 60 + read('minute'));
};

export const readPartOf = (minutes: number): DayPart =>
  minutes < 11 * 60
    ? 'morning'
    : minutes < 14 * 60
      ? 'midday'
      : minutes < 18 * 60
        ? 'afternoon'
        : minutes < 21 * 60
          ? 'evening'
          : 'bedtime';

const median = (values: number[]) => {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const dayRange = (from: string, to: string): string[] =>
  from > to
    ? []
    : Array.from(
        { length: Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1 },
        (_, at) => shiftKey(from, at),
      );

const newest = <Item>(items: Item[], count: number) => items.slice(-count);

export interface DetectHabit extends LifeHabit {
  windowState: Record<
    string,
    ClockWindow & {
      order: number;
      editedAt: number | null;
      part: DayPart | null;
    }
  >;
}

interface DetectInput {
  habit: DetectHabit;
  days: Record<string, LifeDay>;
  /** The habit day of now; a day counts only once it is over. */
  today: string;
  timeZone: string;
  /** Only signals after this instant count (the pattern's `evidenceSince`). */
  since?: number;
}

const readUsableDays = (input: DetectInput, back: number) => {
  const { habit, today, timeZone } = input;
  const spans = readPauseSpans(habit, timeZone);
  const lastStart = readLastStartKey(habit, timeZone);
  const sinceKey = input.since ? habitDayKey(input.since, timeZone) : '';
  return dayRange(shiftKey(today, -back), shiftKey(today, -1)).filter(
    (key) =>
      key >= lastStart &&
      key >= sinceKey &&
      toMs(key) >= habit.startsOn &&
      (habit.endsOn === null || toMs(key) <= habit.endsOn) &&
      !spans.some(
        (span) => key >= span.from && (span.to === null || key < span.to),
      ) &&
      isDueOn(habit.cadence, key),
  );
};

const hasWindows = (habit: DetectHabit) =>
  habit.timesPerDay === null &&
  habit.cadence.kind !== 'timesPerWeek' &&
  Object.keys(habit.windowState).length > 0;

const habitSubject = (
  habit: DetectHabit,
  windowId: string | null,
): Subject => ({
  collection: 'habits',
  id: habit.id,
  windowId,
  otherId: null,
});

/** 4 of the last 5 times a window fell on one weekday were not done (missed or skipped), within 10 weeks; a day counts only when Helm was in use. */
export function detectWindowMissed(input: DetectInput): PatternFinding[] {
  const { habit, days } = input;
  if (!hasWindows(habit)) return [];
  const keys = readUsableDays(
    input,
    PATTERN_THRESHOLDS.windowMissedWeeks * 7,
  ).filter((key) => days[key]?.isInUse);
  return Object.entries(habit.windowState).flatMap(([windowId, window]) =>
    ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).flatMap((weekday) => {
      const last = newest(
        keys.filter((key) => weekdayOf(key) === weekday),
        PATTERN_THRESHOLDS.windowMissedOf,
      );
      const missed = last.filter(
        (key) =>
          days[key].entries[habit.id]?.checks[windowId]?.status !== 'done',
      );
      return last.length < PATTERN_THRESHOLDS.windowMissedOf ||
        missed.length < PATTERN_THRESHOLDS.windowMissedMatched
        ? []
        : [
            toFinding({
              kind: 'windowMissed',
              subject: habitSubject(habit, windowId),
              bucket: {
                kind: 'weekdayPart',
                weekday,
                part: window.part ?? readPartOf(toMinutes(window.start)),
              },
              parts: [],
              evidence: {
                kind: 'occurrences',
                from: toMs(last[0]),
                to: toMs(last[last.length - 1]),
                matched: missed.length,
                total: last.length,
                dayKeys: missed,
              },
              effect: { kind: 'talkItThrough', start: 'differentTime' },
              isCare: habit.isCare,
              lastEvidenceAt: toMs(last[last.length - 1]) + DAY_MS - 1,
            }),
          ];
    }),
  );
}

/** 5 of the last 6 done checks of a window fell outside it on the same side; suggests the window at their median time, same length, on the half hour. */
export function detectDoneOutsideWindow(input: DetectInput): PatternFinding[] {
  const { habit, days, timeZone } = input;
  if (!hasWindows(habit)) return [];
  const keys = readUsableDays(input, 56);
  return Object.entries(habit.windowState).flatMap(([windowId, window]) => {
    const start = toMinutes(window.start);
    const rawEnd = toMinutes(window.end);
    const end = rawEnd <= start ? rawEnd + DAY_MINUTES : rawEnd;
    const done = newest(
      keys.flatMap((key) => {
        const check = days[key]?.entries[habit.id]?.checks[windowId];
        return check?.status === 'done'
          ? [{ key, at: check.at, minutes: localMinutes(check.at, timeZone) }]
          : [];
      }),
      PATTERN_THRESHOLDS.outsideOf,
    );
    if (done.length < PATTERN_THRESHOLDS.outsideOf) return [];
    const before = done.filter((one) => one.minutes < start);
    const after = done.filter((one) => one.minutes > end);
    const outside = before.length >= after.length ? before : after;
    if (outside.length < PATTERN_THRESHOLDS.outsideMatched) return [];
    const side = outside === before ? 'before' : 'after';
    const moved =
      Math.round(median(outside.map((one) => one.minutes)) / HALF_HOUR) *
      HALF_HOUR;
    const next = toAllowedWindow({
      start: toClock(moved),
      end: toClock(moved + (end - start)),
    });
    return next.start === window.start && next.end === window.end
      ? []
      : [
          toFinding({
            kind: 'doneOutsideWindow',
            subject: habitSubject(habit, windowId),
            bucket: { kind: 'none' },
            parts: [side],
            evidence: {
              kind: 'occurrences',
              from: toMs(done[0].key),
              to: toMs(done[done.length - 1].key),
              matched: outside.length,
              total: done.length,
              dayKeys: outside.map((one) => one.key),
            },
            effect: {
              kind: 'moveWindow',
              habitId: habit.id,
              windowId,
              start: next.start,
              end: next.end,
            },
            isCare: habit.isCare,
            lastEvidenceAt: Math.max(...outside.map((one) => one.at)),
          }),
        ];
  });
}

export interface PlannedSlot {
  dayKey: string;
  taskId: string;
  startAt: number | null;
  /** 'suggested' | 'kept' | 'notToday', or 'moved' once a slot keeps its place on its old day. */
  status: string;
  source: 'nomos' | 'person';
  /** The task was done on that day. */
  isDone: boolean;
  /** The task is care: Helm never plans around it. */
  isCare: boolean;
}

/** 5 Helm-planned slots in one weekday and day-part across 4 different weeks of the last 8, 80% not done that day, moved or Not today. Today's slots count only when already moved or Not today'd. */
export function detectPlannedSlotMissed(input: {
  slots: PlannedSlot[];
  today: string;
  timeZone: string;
  isInUse: (dayKey: string) => boolean;
  since?: number;
}): PatternFinding[] {
  const { today, timeZone } = input;
  const from = shiftKey(today, -(PATTERN_THRESHOLDS.slotWeeks * 7 - 1));
  const sinceKey = input.since ? habitDayKey(input.since, timeZone) : '';
  const isOff = (slot: PlannedSlot) =>
    slot.status === 'notToday' || slot.status === 'moved';
  const counted = input.slots.flatMap((slot) =>
    slot.source === 'nomos' &&
    !slot.isCare &&
    slot.startAt !== null &&
    slot.dayKey >= from &&
    slot.dayKey >= sinceKey &&
    slot.dayKey <= today &&
    input.isInUse(slot.dayKey) &&
    (slot.dayKey < today || isOff(slot))
      ? [
          {
            slot,
            weekday: weekdayOf(slot.dayKey),
            part: readPartOf(localMinutes(slot.startAt, timeZone)),
            isMissed: isOff(slot) || !slot.isDone,
          },
        ]
      : [],
  );
  const groups = counted.reduce<Record<string, typeof counted>>(
    (found, one) => ({
      ...found,
      [`${one.weekday}:${one.part}`]: [
        ...(found[`${one.weekday}:${one.part}`] ?? []),
        one,
      ],
    }),
    {},
  );
  return Object.values(groups).flatMap((group) => {
    const missed = group.filter((one) => one.isMissed);
    const weeks = new Set(group.map((one) => readWeekKey(one.slot.dayKey)));
    if (
      group.length < PATTERN_THRESHOLDS.slotCount ||
      weeks.size < PATTERN_THRESHOLDS.slotWeeksNeeded ||
      missed.length / group.length < PATTERN_THRESHOLDS.slotMissedShare
    ) {
      return [];
    }
    const dayKeys = [...new Set(missed.map((one) => one.slot.dayKey))].sort();
    const bucket: PatternBucket = {
      kind: 'weekdayPart',
      weekday: group[0].weekday,
      part: group[0].part,
    };
    return [
      toFinding({
        kind: 'plannedSlotMissed',
        subject: {
          collection: 'planner',
          id: null,
          windowId: null,
          otherId: null,
        },
        bucket,
        parts: [],
        evidence: {
          kind: 'occurrences',
          from: toMs(dayKeys[0]),
          to: toMs(dayKeys[dayKeys.length - 1]),
          matched: missed.length,
          total: group.length,
          dayKeys: newest(dayKeys, 10),
        },
        effect: { kind: 'plannerAvoid', bucket },
        isCare: false,
        lastEvidenceAt: toMs(dayKeys[dayKeys.length - 1]) + DAY_MS - 1,
      }),
    ];
  });
}

/** One fewer time a week, or the most reluctant weekday dropped; never below once a week, and null when there is no smaller step. */
export function lowerCadence(
  cadence: Cadence,
  reluctantWeekdays: Weekday[] = [],
): Cadence | null {
  if (cadence.kind === 'everyDay') return { kind: 'timesPerWeek', count: 6 };
  if (cadence.kind === 'timesPerWeek')
    return cadence.count > 1
      ? { kind: 'timesPerWeek', count: cadence.count - 1 }
      : null;
  if (cadence.kind === 'onWeekdays') {
    if (cadence.weekdays.length <= 1) return null;
    const drop =
      reluctantWeekdays.find((day) => cadence.weekdays.includes(day)) ??
      cadence.weekdays[cadence.weekdays.length - 1];
    return {
      kind: 'onWeekdays',
      weekdays: cadence.weekdays.filter((day) => day !== drop),
    };
  }
  return null;
}

/** One more time a week; never past daily and null when there is no bigger step. */
export function raiseCadence(cadence: Cadence): Cadence | null {
  if (cadence.kind === 'timesPerWeek')
    return cadence.count >= 7
      ? null
      : cadence.count === 6
        ? { kind: 'everyDay' }
        : { kind: 'timesPerWeek', count: cadence.count + 1 };
  if (cadence.kind === 'onWeekdays' && cadence.weekdays.length < 7) {
    const add = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).find(
      (day) => !cadence.weekdays.includes(day),
    );
    return add === undefined
      ? null
      : { kind: 'onWeekdays', weekdays: [...cadence.weekdays, add].sort() };
  }
  return null;
}

const saidEvidence = (
  matched: SaidObservation[],
  dayKeys: string[],
): PatternEvidence => ({
  kind: 'said',
  from: toMs(dayKeys[0]),
  to: toMs(dayKeys[dayKeys.length - 1]),
  matched: dayKeys.length,
  dayKeys: newest(dayKeys, 10),
  observationIds: newest(
    matched.map((one) => one.id),
    10,
  ),
});

/** What was said about one habit on 3 or more different days in 2 weeks, in one direction; a care habit only gets a statement. */
export function readSaidCandidates(input: {
  observations: SaidObservation[];
  habits: { id: string; isCare: boolean; windowIds: string[] }[];
  today: string;
  /** `evidenceSince` by signature, for what was already answered. */
  sinceBySignature?: Record<string, number>;
  isPausedDay?: (habitId: string, dayKey: string) => boolean;
}): PatternFinding[] {
  return input.habits.flatMap((habit) => {
    const subject: Subject = {
      collection: 'habits',
      id: habit.id,
      windowId: null,
      otherId: null,
    };
    const bucket: PatternBucket = { kind: 'none' };
    const since = (kind: PatternKind) =>
      input.sinceBySignature?.[patternSignature({ kind, subject, bucket })] ??
      0;
    const probe = readSaidSignals(
      input.observations,
      habit.id,
      0,
      input.today,
      (key) => input.isPausedDay?.(habit.id, key) ?? false,
    );
    if (!probe) return [];
    const kind: PatternKind =
      probe.kind === 'struggling' ? 'saidStruggling' : 'saidWorking';
    const signal = readSaidSignals(
      input.observations,
      habit.id,
      since(kind),
      input.today,
      (key) => input.isPausedDay?.(habit.id, key) ?? false,
    );
    if (!signal) return [];
    const matched = input.observations.filter((one) =>
      signal.observationIds.includes(one.id),
    );
    return [
      toFinding({
        kind,
        subject,
        bucket,
        parts: [],
        evidence: saidEvidence(matched, signal.dayKeys),
        effect:
          kind === 'saidStruggling'
            ? { kind: 'talkItThrough', start: 'differentTime' }
            : habit.windowIds.length > 0
              ? {
                  kind: 'keepTime',
                  habitId: habit.id,
                  windowId: habit.windowIds[0],
                }
              : { kind: 'none' },
        isCare: habit.isCare || signal.isCare,
        tags: signal.tags,
        lastEvidenceAt: Math.max(...matched.map((one) => one.at)),
      }),
    ];
  });
}

const SUGGESTION_EFFECT: Record<
  ReflectionSealed['candidates'][number]['suggestion'],
  PatternEffect
> = {
  differentTime: { kind: 'talkItThrough', start: 'differentTime' },
  smaller: { kind: 'talkItThrough', start: 'smaller' },
  somethingNew: { kind: 'talkItThrough', start: 'somethingNew' },
  none: { kind: 'none' },
};

/** The nightly pass's candidates, each re-checked here (3 or more different days among observations that exist) and made a finding of its own kind. */
export function readSaidLinkCandidates(input: {
  candidates: ReflectionSealed['candidates'];
  observations: SaidObservation[];
  isCareOf: (subject: {
    collection: 'habits' | 'projects';
    id: string;
  }) => boolean;
}): PatternFinding[] {
  return input.candidates.flatMap((candidate) => {
    const matched = input.observations.filter((one) =>
      candidate.observationIds.includes(one.id),
    );
    const dayKeys = [...new Set(matched.map((one) => one.dayKey))].sort();
    if (dayKeys.length < 3) return [];
    return [
      toFinding({
        kind: 'saidLink',
        subject: {
          collection: candidate.subject.collection,
          id: candidate.subject.id,
          windowId: null,
          otherId: null,
        },
        bucket: { kind: 'none' },
        parts: candidate.tags,
        evidence: saidEvidence(matched, dayKeys),
        effect: SUGGESTION_EFFECT[candidate.suggestion],
        isCare: input.isCareOf(candidate.subject),
        tags: candidate.tags,
        linkedTo: candidate.linkedTo,
        lastEvidenceAt: Math.max(...matched.map((one) => one.at)),
      }),
    ];
  });
}

type BackoffPattern = Pick<
  Pattern,
  | 'state'
  | 'declineCount'
  | 'nextEligibleOn'
  | 'offReason'
  | 'offAt'
  | 'isLive'
  | 'evidenceSince'
  | 'history'
  | 'stateAt'
  | 'acceptedBy'
>;

export type BackoffPatch = Pick<
  Pattern,
  | 'state'
  | 'declineCount'
  | 'nextEligibleOn'
  | 'offReason'
  | 'offAt'
  | 'isLive'
  | 'evidenceSince'
  | 'history'
  | 'stateAt'
>;

const HISTORY_KEPT = 20;

const withHistory = (
  pattern: Pick<Pattern, 'history'>,
  to: Pattern['history'][number]['to'],
  at: number,
  by: 'person' | 'nomos',
) => [...pattern.history, { to, at, by }].slice(-HISTORY_KEPT);

/** A no (Not now, or Undo of an act): the wait grows with the count and the third is final; coming back needs signals after now. `today` is date-only. */
export function applyNo(
  pattern: BackoffPattern,
  input: {
    to: 'declined' | 'undone';
    now: number;
    today: number;
    by: 'person' | 'nomos';
  },
): BackoffPatch {
  const declineCount = pattern.declineCount + 1;
  const isFinal = declineCount > PATTERN_BACKOFF_WEEKS.length;
  return {
    state: input.to,
    declineCount,
    nextEligibleOn: isFinal
      ? null
      : input.today + PATTERN_BACKOFF_WEEKS[declineCount - 1] * 7 * DAY_MS,
    offReason: isFinal ? 'thirdNo' : pattern.offReason,
    offAt: isFinal ? input.now : pattern.offAt,
    isLive: !isFinal,
    evidenceSince: input.now,
    history: withHistory(
      pattern,
      isFinal ? 'off' : input.to,
      input.now,
      input.by,
    ),
    stateAt: input.now,
  };
}

/** "Stop suggesting that": never shown again unless reopened; the state and signature stay. */
export function applyStop(
  pattern: BackoffPattern,
  input: { now: number },
): BackoffPatch {
  return {
    state: pattern.state,
    declineCount: pattern.declineCount,
    nextEligibleOn: null,
    offReason: 'askedToStop',
    offAt: input.now,
    isLive: false,
    evidenceSince: pattern.evidenceSince,
    history: withHistory(pattern, 'off', input.now, 'person'),
    stateAt: input.now,
  };
}

/** The effect ends, the count and wait reset, and the same pattern needs fresh evidence at normal thresholds. */
export function applyRetire(
  pattern: BackoffPattern,
  input: { now: number },
): BackoffPatch {
  return {
    state: 'retired',
    declineCount: 0,
    nextEligibleOn: null,
    offReason: null,
    offAt: null,
    isLive: false,
    evidenceSince: input.now,
    history: withHistory(pattern, 'retired', input.now, 'person'),
    stateAt: input.now,
  };
}

/** The only way back from off. */
export function applyReopen(
  pattern: BackoffPattern,
  input: { now: number },
): BackoffPatch {
  return {
    state: 'declined',
    declineCount: 0,
    nextEligibleOn: null,
    offReason: null,
    offAt: null,
    isLive: true,
    evidenceSince: pattern.evidenceSince,
    history: withHistory(pattern, 'reopened', input.now, 'person'),
    stateAt: input.now,
  };
}

const WAITING_STATES: PatternState[] = [
  'candidate',
  'declined',
  'undone',
  'retired',
];

/** May it be shown now? A pattern never made is eligible; one off never is; one answered waits out its date (date-only `today`). */
export function isPatternEligible(
  pattern: Pick<Pattern, 'state' | 'offReason' | 'nextEligibleOn'> | null,
  today: number,
): boolean {
  if (pattern === null) return true;
  return (
    pattern.offReason === null &&
    WAITING_STATES.includes(pattern.state) &&
    (pattern.nextEligibleOn === null || today >= pattern.nextEligibleOn)
  );
}

const ratio = (matched: number, total: number) =>
  total === 0 ? 0 : matched / total;

/** Fresh evidence at least as strong as what was last shown, and counted only after `since`: 4 of 5 needs 4 of 5 again, never 3 of 4; load needs to be at least as far over its limit; said needs 3 new days. */
export function isEvidenceAsStrong(
  shown: PatternEvidence,
  fresh: PatternEvidence,
  since: number,
): boolean {
  const isAfter = (dayKeys: string[]) =>
    dayKeys.length > 0 && dayKeys.every((key) => toMs(key) + DAY_MS > since);
  if (shown.kind === 'occurrences' && fresh.kind === 'occurrences')
    return (
      isAfter(fresh.dayKeys) &&
      fresh.matched >= shown.matched &&
      ratio(fresh.matched, fresh.total) >= ratio(shown.matched, shown.total)
    );
  if (shown.kind === 'load' && fresh.kind === 'load')
    return (
      fresh.asOf > since &&
      ratio(fresh.measured, fresh.limit) >= ratio(shown.measured, shown.limit)
    );
  if (shown.kind === 'said' && fresh.kind === 'said')
    return isAfter(fresh.dayKeys) && fresh.dayKeys.length >= 3;
  return false;
}

type OfferPattern = Pick<
  Pattern,
  'kind' | 'state' | 'handling' | 'offReason' | 'nextEligibleOn' | 'stateAt'
>;

const offerRank = (pattern: OfferPattern) =>
  pattern.handling === 'askOnly'
    ? 0
    : { guardrail: 1, habitLife: 2, noticed: 3 }[patternFamily(pattern.kind)];

/** Today's one new offer: at most one new a day, three suggested at once, care asks first, then guardrails, habit-life offers, the rest. `today` is date-only. */
export function pickTodayOffer(input: {
  patterns: { id: string; pattern: OfferPattern }[];
  suggestedCount: number;
  isNewShownToday: boolean;
  today: number;
  isLearningOn: boolean;
}): string | null {
  if (
    !input.isLearningOn ||
    input.isNewShownToday ||
    input.suggestedCount >= PATTERN_THRESHOLDS.suggestedAtOnce
  ) {
    return null;
  }
  const [first] = input.patterns
    .filter(
      ({ pattern }) =>
        pattern.state === 'candidate' &&
        isPatternEligible(pattern, input.today),
    )
    .sort(
      (a, b) =>
        offerRank(a.pattern) - offerRank(b.pattern) ||
        a.pattern.stateAt - b.pattern.stateAt ||
        a.id.localeCompare(b.id),
    );
  return first?.id ?? null;
}

const formatSaidDates = (dayKeys: string[]) =>
  formatList(dayKeys.map((key) => formatDateShortUTC(toMs(key))));

/** The two lines a pattern is shown with, from templates; no model words, nothing about mood or health. */
export function buildPatternLines(input: {
  finding: Pick<
    PatternFinding,
    'kind' | 'bucket' | 'evidence' | 'linkedTo' | 'parts' | 'effect'
  >;
  name: string;
}): { statement: string; evidenceLine: string } {
  const { finding, name } = input;
  const evidence = finding.evidence;
  const weekday =
    finding.bucket.kind === 'weekdayPart'
      ? HELM_COPY.habitWeekdaysLong[finding.bucket.weekday]
      : '';
  const part =
    finding.bucket.kind === 'weekdayPart'
      ? HELM_COPY.patternPartPlural[finding.bucket.part]
      : '';
  const said =
    evidence.kind === 'said'
      ? HELM_COPY.patternSaidEvidence(formatSaidDates(evidence.dayKeys))
      : '';
  if (finding.kind === 'windowMissed' && evidence.kind === 'occurrences')
    return {
      statement: HELM_COPY.patternWindowMissedStatement(name, weekday, part),
      evidenceLine: HELM_COPY.patternWindowMissedEvidence(
        evidence.matched,
        evidence.total,
        weekday,
      ),
    };
  if (finding.kind === 'doneOutsideWindow' && evidence.kind === 'occurrences')
    return {
      statement: HELM_COPY.patternDoneOutsideStatement(
        name,
        finding.parts[0] === 'after' ? 'after' : 'before',
      ),
      evidenceLine: HELM_COPY.patternDoneOutsideEvidence(
        evidence.matched,
        evidence.total,
        finding.effect.kind === 'moveWindow'
          ? formatClockTime(finding.effect.start)
          : '',
      ),
    };
  if (finding.kind === 'plannedSlotMissed' && evidence.kind === 'occurrences')
    return {
      statement: HELM_COPY.patternPlannedSlotStatement(weekday, part),
      evidenceLine: HELM_COPY.patternPlannedSlotEvidence(
        evidence.matched,
        evidence.total,
        PATTERN_THRESHOLDS.slotWeeks,
      ),
    };
  if (finding.kind === 'saidWorking')
    return {
      statement: HELM_COPY.patternSaidWorkingStatement(name),
      evidenceLine: said,
    };
  if (finding.kind === 'saidLink')
    return {
      statement: HELM_COPY.patternSaidLinkStatement(
        name,
        HELM_COPY.patternLinkPhrases[finding.linkedTo ?? 'other'],
      ),
      evidenceLine: said,
    };
  return {
    statement: HELM_COPY.patternSaidStrugglingStatement(name),
    evidenceLine: said,
  };
}
