// Generated from src/apps/helm/engine/scheduledActions.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { dayKeyToMs, msToDayKey, shiftDayKeyBy } from '../../../vendor/cadenceUtils.js';
import {
  checkRepeatRule,
  describeRepeat,
  formatRepeatRule,
  listOccurrences,
  parseRepeatRule,
  type RepeatCapError,
  type RepeatRule,
} from '../../../vendor/repeatRule.js';
import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';

export const MAX_SCHEDULED_ACTIONS = 50;
export const MAX_SKIPPED = 100;
export const MAX_MOVED = 20;
/** A run missed while nothing was looking runs if it is less than this late, else it is skipped. */
export const LATE_LIMIT_MS = 6 * 60 * 60 * 1000;
export const RUN_NEXT_SHOWN = 3;

const SCAN = 400;

export interface RunSchedule {
  repeat: string | null;
  startsOn: string;
  time: string;
  timeZone: string | null;
  skipped: string[];
  moved: Record<string, { day: string; time: string }>;
  pausedFrom: number | null;
  pausedUntil: number | null;
}

/** One run: `key` is the original day key (its capture id and the key Skip and Move name), `day` where it lands after a move. */
export interface Occurrence {
  key: string;
  day: string;
  time: string;
  at: number;
}

export const toCaptureId = (actionId: string, key: string) =>
  `sa_${actionId}_${key}`;

/** The day key a capture id was made for; null for an id this module didn't make. */
export const readCaptureKey = (captureId: string | null) =>
  captureId?.match(/^sa_.+_(\d{4}-\d{2}-\d{2})(?:_now)?$/)?.[1] ?? null;

const dayKeyIn = (at: number, zone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));

export const toDayKeyIn = dayKeyIn;

const spanKeys = (schedule: RunSchedule) =>
  schedule.pausedFrom !== null && schedule.pausedUntil !== null
    ? {
        from: msToDayKey(schedule.pausedFrom),
        to: msToDayKey(schedule.pausedUntil),
      }
    : null;

/** The stored rule's problem, or null; a rule that finished is not a problem. `null` repeat is a single run on `startsOn`. */
export function readRuleProblem(
  repeat: string | null,
  startsOn: string,
): RepeatCapError | null {
  if (repeat === null)
    return /^\d{4}-\d{2}-\d{2}$/.test(startsOn) ? null : 'shape';
  const rule = parseRepeatRule(repeat);
  return rule ? checkRepeatRule(rule, startsOn, startsOn) : 'shape';
}

/** The runs from `fromKey` (an original day key, inclusive), in order, with skips, moves and the paused span applied. Null when the stored rule won't read. Order never changes: a move stays between its neighbours. */
export function readOccurrences(
  schedule: RunSchedule,
  homeZone: string,
  options: { fromKey: string; limit: number },
): Occurrence[] | null {
  if (readRuleProblem(schedule.repeat, schedule.startsOn)) return null;
  const rule = schedule.repeat ? parseRepeatRule(schedule.repeat) : null;
  const movedKeys = Object.keys(schedule.moved);
  const fromDay = [options.fromKey, ...movedKeys].reduce((least, key) =>
    key < least ? key : least,
  );
  const zone = schedule.timeZone ?? homeZone;
  const paused = spanKeys(schedule);
  return listOccurrences(rule, schedule.startsOn, {
    fromDay,
    limit: options.limit + movedKeys.length,
    skipped: schedule.skipped,
  })
    .filter((key) => key >= options.fromKey)
    .flatMap((key): Occurrence[] => {
      const day = schedule.moved[key]?.day ?? key;
      const time = schedule.moved[key]?.time ?? schedule.time;
      return paused && day >= paused.from && day <= paused.to
        ? []
        : [{ key, day, time, at: zonedDateTimeToEpoch(day, time, zone) }];
    })
    .slice(0, options.limit);
}

/** The first run after the run named `afterKey`, or the first one still ahead of `now` when none is named; null when the rule has no run left. */
export function readNextRun(
  schedule: RunSchedule,
  homeZone: string,
  options: { now: number; afterKey?: string | null },
): Occurrence | null {
  const afterKey = options.afterKey ?? null;
  const from =
    afterKey ??
    shiftDayKeyBy(dayKeyIn(options.now, schedule.timeZone ?? homeZone), -1);
  const found = readOccurrences(schedule, homeZone, {
    fromKey: from,
    limit: SCAN,
  });
  return (
    found?.find((run) =>
      afterKey !== null ? run.key > afterKey : run.at > options.now,
    ) ?? null
  );
}

/** The next few runs' instants, for the reply and the sheet. */
export function readNextRuns(
  schedule: RunSchedule,
  homeZone: string,
  now: number,
  count = RUN_NEXT_SHOWN,
): Occurrence[] {
  const first = readNextRun(schedule, homeZone, { now });
  if (!first) return [];
  return (
    readOccurrences(schedule, homeZone, { fromKey: first.key, limit: count }) ??
    []
  );
}

/** Whether a rule that has been read has more runs after the one named. */
export const hasRunAfter = (
  schedule: RunSchedule,
  homeZone: string,
  key: string,
  now: number,
) => readNextRun(schedule, homeZone, { now, afterKey: key }) !== null;

/** The runs due by `now`, from `fromKey`: the newest under 6 hours late is run, every earlier one is skipped. A run the person waited for (over their limits) has no lateness. */
export function readDueRuns(
  occurrences: Occurrence[],
  now: number,
  options: { waitingKey: string | null } = { waitingKey: null },
): { run: Occurrence | null; skipped: Occurrence[]; isLate: boolean } {
  const due = occurrences.filter((entry) => entry.at <= now);
  const newest = due[due.length - 1] ?? null;
  if (!newest) return { run: null, skipped: [], isLate: false };
  const isWaited = options.waitingKey === newest.key;
  const isTooLate = !isWaited && now - newest.at >= LATE_LIMIT_MS;
  return {
    run: isTooLate ? null : newest,
    skipped: isTooLate ? due : due.slice(0, -1),
    isLate: !isWaited && now - newest.at > 10 * 60 * 1000,
  };
}

export type RunBlock = {
  reason: 'notConnected' | 'grantExpired' | 'notAllowed';
  /** The connection's or kind's name a line says. */
  name: string;
};

/** What stops a run before any model call: a command kind that is not on the closed list any more, or a source the action needs that is missing or expired. */
export function readRunBlocker(input: {
  allowed: string[];
  permitted: readonly string[];
  needs: { name: string; state: 'connected' | 'missing' | 'expired' }[];
}): RunBlock | null {
  const refused = input.allowed.find((kind) => !input.permitted.includes(kind));
  if (refused) return { reason: 'notAllowed', name: refused };
  const unmet = input.needs.find((need) => need.state !== 'connected');
  return unmet
    ? {
        reason: unmet.state === 'expired' ? 'grantExpired' : 'notConnected',
        name: unmet.name,
      }
    : null;
}

export const RULE_PROBLEM_WORDS: Record<RepeatCapError, string> = {
  tooOften:
    'That repeats more often than once a day, and the most often is daily',
  interval: 'That skips too many days, weeks, months or years between runs',
  count: 'That runs too many times (the most is 999)',
  untilBeforeStart: 'That ends before it starts',
  neverComes: 'That never comes round',
  shape: "That isn't a repeat Helm can keep",
};

const timeWords = (at: number, zone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));

/** The one line an outcome shows on Today and in Activity, built from fields, never a model's words. */
export function describeScheduledOutcome(input: {
  title: string;
  outcome: 'done' | 'needsYou' | 'failed' | 'skipped' | 'waiting';
  reason:
    | 'notConnected'
    | 'grantExpired'
    | 'notAllowed'
    | 'runFailed'
    | 'ruleInvalid'
    | null;
  dueAt: number;
  zone: string;
  name?: string | null;
}): string {
  const when = timeWords(input.dueAt, input.zone);
  const name = input.name ?? 'it';
  if (input.outcome === 'done') return `${input.title}: done for you · ${when}`;
  if (input.outcome === 'needsYou')
    return `${input.title}: ready for you · ${when}`;
  if (input.outcome === 'waiting') {
    return `${input.title} is waiting until you open Helm, since today's limit was reached`;
  }
  if (input.outcome === 'skipped') {
    return `${input.title} was skipped (${when}): Helm wasn't able to run it within 6 hours`;
  }
  if (input.reason === 'ruleInvalid') {
    return `${input.title} didn't run (${when}): its repeat can't be read. Change it to set it again.`;
  }
  const why =
    input.reason === 'notConnected'
      ? `${name} isn't connected`
      : input.reason === 'grantExpired'
        ? `${name}'s access ran out`
        : input.reason === 'notAllowed'
          ? `it's no longer allowed to do ${name}`
          : 'something went wrong';
  return `${input.title} didn't run (${when}): ${why}.`;
}

/** The reply's words for a made rule: the same line the sheet shows, then the next runs. */
export function describeScheduledRule(
  schedule: RunSchedule,
  homeZone: string,
  now: number,
): { words: string; next: Occurrence[] } {
  const rule = schedule.repeat ? parseRepeatRule(schedule.repeat) : null;
  return {
    words: describeRepeat(rule, schedule.startsOn, { time: schedule.time }),
    next: readNextRuns(schedule, homeZone, now),
  };
}

export type MoveBlock = 'past' | 'ran' | 'tooLate' | 'none';

/** The days a run can be moved to: today or later, after the run before it, and no later than the day before the run after it (null: no bound). */
export function readMoveRange(
  schedule: RunSchedule,
  homeZone: string,
  options: { key: string; now: number; lastRunDay: string | null },
): { earliest: string; latest: string | null } | null {
  const zone = schedule.timeZone ?? homeZone;
  const today = dayKeyIn(options.now, zone);
  const runs = readOccurrences(schedule, homeZone, {
    fromKey: shiftDayKeyBy(options.key, -400),
    limit: SCAN,
  });
  const index = runs?.findIndex((run) => run.key === options.key) ?? -1;
  if (!runs || index < 0) return null;
  const before = runs[index - 1]?.day ?? options.lastRunDay;
  const after = runs[index + 1]?.day ?? null;
  const floor = before ? shiftDayKeyBy(before, 1) : today;
  return {
    earliest: floor > today ? floor : today,
    latest: after ? shiftDayKeyBy(after, -1) : null,
  };
}

export function checkMove(
  range: { earliest: string; latest: string | null } | null,
  day: string,
  options: { today: string; ranDays: string[] },
): MoveBlock {
  if (!range) return 'none';
  if (options.ranDays.includes(day)) return 'ran';
  if (day < options.today || day < range.earliest) return 'past';
  return range.latest !== null && day > range.latest ? 'tooLate' : 'none';
}

/** `skipped` and `moved` without what is behind the run that just went, so neither grows without end. */
export function pruneRuns(
  schedule: Pick<RunSchedule, 'skipped' | 'moved'>,
  ranKey: string,
): Pick<RunSchedule, 'skipped' | 'moved'> {
  return {
    skipped: schedule.skipped.filter((key) => key > ranKey),
    moved: Object.fromEntries(
      Object.entries(schedule.moved).filter(([key]) => key > ranKey),
    ),
  };
}

const withEnd = (
  rule: RepeatRule,
  until: string | null,
  count: number | null,
) => ({
  ...rule,
  until,
  count,
});

/** What "this and following" becomes. From the next run (`fromKey === nextKey`) the record is rewritten in place; from a later run it splits: the old one ends the day before and `created` starts at the run. Skips and moves stay only where they still fall on a run of the rule that now holds them; `dropped` counts the rest. COUNT carries when the new rule keeps the old rule's count, less the runs already past. */
export function planFollowing(input: {
  current: RunSchedule;
  fromKey: string;
  nextKey: string;
  next: {
    rule: RepeatRule | null;
    startsOn: string;
    time: string;
    timeZone: string | null;
  };
}):
  | { error: 'countSpent' | 'shape' }
  | {
      isSplit: boolean;
      keep: Pick<
        RunSchedule,
        'repeat' | 'startsOn' | 'time' | 'timeZone' | 'skipped' | 'moved'
      >;
      created: Pick<
        RunSchedule,
        'repeat' | 'startsOn' | 'time' | 'timeZone' | 'skipped' | 'moved'
      > | null;
      dropped: number;
    } {
  const { current, fromKey, nextKey, next } = input;
  const old = current.repeat ? parseRepeatRule(current.repeat) : null;
  const before = listOccurrences(old, current.startsOn, {
    limit: 2000,
    skipped: [],
  }).filter((key) => key < fromKey).length;
  const carriesCount =
    next.rule?.count != null && old?.count === next.rule.count;
  const remaining = carriesCount
    ? next.rule!.count! - before
    : (next.rule?.count ?? null);
  if (remaining !== null && remaining <= 0) return { error: 'countSpent' };
  const rule = next.rule ? { ...next.rule, count: remaining } : null;
  if (rule && checkRepeatRule(rule, next.startsOn, next.startsOn)) {
    return { error: 'shape' };
  }
  const startsRule = rule ? formatRepeatRule(rule) : null;
  const fits = (key: string) =>
    key >= next.startsOn &&
    listOccurrences(rule, next.startsOn, { fromDay: key, limit: 1 })[0] === key;
  const forward = {
    skipped: current.skipped.filter(fits),
    moved: Object.fromEntries(
      Object.entries(current.moved).filter(([key]) => fits(key)),
    ),
  };
  const dropped =
    current.skipped.length -
    forward.skipped.length +
    Object.keys(current.moved).length -
    Object.keys(forward.moved).length;
  const created = {
    repeat: startsRule,
    startsOn: next.startsOn,
    time: next.time,
    timeZone: next.timeZone,
    ...forward,
  };
  if (fromKey <= nextKey)
    return { isSplit: false, keep: created, created: null, dropped };
  const oldHalf = old ? withEnd(old, shiftDayKeyBy(fromKey, -1), null) : null;
  return {
    isSplit: true,
    keep: {
      repeat: oldHalf ? formatRepeatRule(oldHalf) : current.repeat,
      startsOn: current.startsOn,
      time: current.time,
      timeZone: current.timeZone,
      skipped: current.skipped.filter((key) => key < fromKey),
      moved: Object.fromEntries(
        Object.entries(current.moved).filter(([key]) => key < fromKey),
      ),
    },
    created,
    dropped,
  };
}

/** A pause by a time-away span for an action with a run inside it, or null when none falls there. `fromDay`/`toDay` are day keys, inclusive. */
export function readSpanPause(
  schedule: RunSchedule,
  homeZone: string,
  span: { fromDay: string; toDay: string },
  now: number,
): { pausedFrom: number; pausedUntil: number } | null {
  const free: RunSchedule = {
    ...schedule,
    pausedFrom: null,
    pausedUntil: null,
  };
  const first = readNextRun(free, homeZone, { now });
  const runs = first
    ? (readOccurrences(free, homeZone, { fromKey: first.key, limit: SCAN }) ??
      [])
    : [];
  const isInside = runs.some(
    (run) => run.day >= span.fromDay && run.day <= span.toDay,
  );
  if (!isInside) return null;
  const from = Math.min(
    dayKeyToMs(span.fromDay),
    schedule.pausedFrom ?? Infinity,
  );
  const until = Math.max(
    dayKeyToMs(span.toDay),
    schedule.pausedUntil ?? -Infinity,
  );
  return { pausedFrom: from, pausedUntil: until };
}

/** Whether Run it now is allowed: only after a run that couldn't go, and only before the action's next scheduled run. */
export const canRunNow = (input: {
  status: 'active' | 'paused' | 'ended';
  lastOutcome: string | null;
  nextRunAt: number | null;
  now: number;
}) =>
  input.status === 'active' &&
  input.lastOutcome === 'failed' &&
  input.nextRunAt !== null &&
  input.now < input.nextRunAt;

export interface ActionState extends RunSchedule {
  status: 'active' | 'paused' | 'ended';
  endedBy: 'person' | 'finished' | null;
  nextRunAt: number | null;
  nextRunKey: string | null;
  lastRunDueAt: number | null;
}

export type ScheduleChange =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'end' }
  | { kind: 'skip'; key: string | null }
  | { kind: 'move'; key: string | null; day: string; time: string | null }
  | {
      kind: 'following';
      fromKey: string | null;
      /** The rule from that run on; null keeps the one it has. */
      rule: RepeatRule | null;
      time: string | null;
    };

export type ChangeRefusal =
  | 'ended'
  | 'noRun'
  | 'past'
  | 'ran'
  | 'tooLate'
  | 'tooMany'
  | 'countSpent'
  | 'shape'
  | 'neverComes';

export const CHANGE_REFUSAL_WORDS: Record<ChangeRefusal, string> = {
  ended: 'That one has ended',
  noRun: 'That one has no run left to change',
  past: "That day has already gone by, so a run can't move there",
  ran: 'It already ran that day',
  tooLate: 'A run can move at most to the day before the one after it',
  tooMany: 'That has too many skipped or moved runs; let some pass first',
  countSpent: 'Its repeat has already gone round that many times',
  shape: "That isn't a repeat Helm can keep",
  neverComes: 'That never comes round',
};

type Fields = Partial<ActionState>;

const nextFields = (
  state: ActionState,
  homeZone: string,
  now: number,
): Fields => {
  const run =
    state.status === 'active' ? readNextRun(state, homeZone, { now }) : null;
  return { nextRunAt: run?.at ?? null, nextRunKey: run?.key ?? null };
};

/** The fields a rule from `startsOn` needs to be stored: its RRULE body, or the problem. A rule with no freq is a single run. */
export function buildScheduleRule(
  rule: RepeatRule | null,
  startsOn: string,
  today: string,
): { repeat: string | null } | { error: RepeatCapError } {
  if (!rule) {
    return /^\d{4}-\d{2}-\d{2}$/.test(startsOn)
      ? { repeat: null }
      : { error: 'shape' };
  }
  const error = checkRepeatRule(rule, startsOn, today);
  return error ? { error } : { repeat: formatRepeatRule(rule) };
}

/** What a skip, move, pause, resume, end or "this and following" does to one action's fields, or why it can't. `fields` holds only what changes (a changed repeat or time brings its new `nextRunAt`); `created` is the newer half of a split. */
export function planScheduleChange(
  state: ActionState,
  change: ScheduleChange,
  context: { homeZone: string; now: number },
):
  | { refused: ChangeRefusal }
  | {
      fields: Fields;
      created: ActionState | null;
      dropped: number;
      key: string | null;
    } {
  const { homeZone, now } = context;
  if (state.status === 'ended') return { refused: 'ended' };
  const zone = state.timeZone ?? homeZone;
  const today = dayKeyIn(now, zone);
  const done = (fields: Fields, key: string | null = null) => ({
    fields,
    created: null,
    dropped: 0,
    key,
  });
  if (change.kind === 'end') {
    return done({
      status: 'ended',
      endedBy: 'person',
      nextRunAt: null,
      nextRunKey: null,
    });
  }
  if (change.kind === 'pause') {
    return done({ status: 'paused', nextRunAt: null, nextRunKey: null });
  }
  if (change.kind === 'resume') {
    const resumed: ActionState = {
      ...state,
      status: 'active',
      pausedFrom: null,
      pausedUntil: null,
    };
    const run = readNextRun(resumed, homeZone, { now });
    return run
      ? done({
          status: 'active',
          pausedFrom: null,
          pausedUntil: null,
          nextRunAt: run.at,
          nextRunKey: run.key,
        })
      : { refused: 'neverComes' };
  }
  const key = change.kind === 'following' ? change.fromKey : change.key;
  const target = key ?? state.nextRunKey;
  if (target === null) return { refused: 'noRun' };
  const runs = readOccurrences(state, homeZone, {
    fromKey: state.nextRunKey ?? target,
    limit: SCAN,
  });
  const known = runs?.find((run) => run.key === target);
  if (!known) return { refused: 'noRun' };
  if (change.kind === 'skip') {
    if (state.skipped.length >= MAX_SKIPPED) return { refused: 'tooMany' };
    const skipped: ActionState = {
      ...state,
      skipped: [...state.skipped, target].sort(),
    };
    return done(
      { skipped: skipped.skipped, ...nextFields(skipped, homeZone, now) },
      target,
    );
  }
  if (change.kind === 'move') {
    const range = readMoveRange(state, homeZone, {
      key: target,
      now,
      lastRunDay:
        state.lastRunDueAt === null ? null : dayKeyIn(state.lastRunDueAt, zone),
    });
    const ranDay =
      state.lastRunDueAt === null ? [] : [dayKeyIn(state.lastRunDueAt, zone)];
    const block = checkMove(range, change.day, { today, ranDays: ranDay });
    if (block !== 'none') {
      return { refused: block };
    }
    if (
      Object.keys(state.moved).filter((one) => one !== target).length >=
      MAX_MOVED
    ) {
      return { refused: 'tooMany' };
    }
    const moved = {
      ...state.moved,
      [target]: { day: change.day, time: change.time ?? known.time },
    };
    return done(
      { moved, ...nextFields({ ...state, moved }, homeZone, now) },
      target,
    );
  }
  const following = planFollowing({
    current: state,
    fromKey: target,
    nextKey: state.nextRunKey ?? target,
    next: {
      rule:
        change.rule ?? (state.repeat ? parseRepeatRule(state.repeat) : null),
      startsOn: known.key,
      time: change.time ?? state.time,
      timeZone: state.timeZone,
    },
  });
  if ('error' in following) return { refused: following.error };
  const half = (
    base: ActionState,
    part: typeof following.keep,
    extra: Fields,
  ): ActionState => ({ ...base, ...part, ...extra });
  const kept = half(state, following.keep, {});
  const createdState = following.created
    ? half(state, following.created, {
        status: 'active',
        endedBy: null,
        lastRunDueAt: null,
        pausedFrom: following.isSplit ? state.pausedFrom : null,
        pausedUntil: following.isSplit ? state.pausedUntil : null,
      })
    : null;
  const newer = following.isSplit ? createdState : kept;
  if (!newer) return { refused: 'shape' };
  const run = readNextRun(newer, homeZone, {
    now,
    afterKey: null,
  });
  if (!run) return { refused: 'neverComes' };
  if (!following.isSplit) {
    return {
      fields: {
        repeat: kept.repeat,
        startsOn: kept.startsOn,
        time: kept.time,
        skipped: kept.skipped,
        moved: kept.moved,
        nextRunAt: run.at,
        nextRunKey: run.key,
      },
      created: null,
      dropped: following.dropped,
      key: target,
    };
  }
  const older = readNextRun(kept, homeZone, { now });
  return {
    fields: {
      repeat: kept.repeat,
      skipped: kept.skipped,
      moved: kept.moved,
      nextRunAt: older?.at ?? null,
      nextRunKey: older?.key ?? null,
    },
    created: {
      ...newer,
      nextRunAt: run.at,
      nextRunKey: run.key,
    },
    dropped: following.dropped,
    key: target,
  };
}
