import {
  dayKeyToMs as toMs,
  isDueOn,
  msToDayKey as toKey,
  shiftDayKeyBy as shiftKey,
} from '@/utils/cadenceUtils';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import {
  HABIT_DAY_ROLLOVER,
  habitDayKey,
  readPauseSpans,
  type ClockWindow,
  type HabitScheduleLike,
} from '@apps/helm/engine/habitDay';

export type LifeStage = 'building' | 'holding' | 'formed' | 'buildingAgain';

/** Product's thresholds; Helm's judgment of how reliably a thing happened, never a claim about science. */
export const HABIT_LIFE = {
  holdingKeptRun: 3,
  slipUnkeptRun: 2,
  formedLookback: 10,
  formedKept: 8,
  formedUnreminded: 4,
  formedWeeksSinceStart: 10,
  minKnownDueTimes: 3,
  maxMissedInKeptWeek: 1,
  judgedWeeks: 16,
} as const;

const WEEK_DAYS = 7;

export interface LifeHabit extends HabitScheduleLike {
  id: string;
  windowState: Record<
    string,
    ClockWindow & { order: number; editedAt: number | null }
  >;
  isCare: boolean;
  forWhoId: string | null;
  stage: LifeStage | null;
  stageAt: number;
  stageWeek: string | null;
  rejudgeFrom: string | null;
  formedAt: number | null;
}

export interface LifeDay {
  isInUse: boolean;
  entries: Record<
    string,
    {
      checks: Record<string, { status: string; at: number }>;
      count: number;
      lastCountAt: number | null;
      reminded: Record<string, number> | null;
    }
  >;
}

/** One due time that counts: its window on a due day ('day' for no window or a tally), or a times-a-week habit's week ('week'). */
export interface Occurrence {
  dayKey: string;
  unitId: string;
  isDone: boolean;
  isUnreminded: boolean;
}

export interface KeptWeek {
  /** The Monday's day key. */
  week: string;
  state: 'kept' | 'unkept' | 'skipped';
  isUnreminded: boolean;
  weeksSinceStart: number;
}

export interface HabitStageEvent {
  kind: 'stage';
  at: number;
  by: 'nomos';
  pace: null;
  stage: LifeStage;
}

/** What to write on the habit in a transaction; `event` is appended to its history when not null. */
export interface HabitStagePatch {
  stage: LifeStage | null;
  stageAt: number;
  stageWeek: string | null;
  formedAt: number | null;
  rejudgeFrom: null;
  isStageChange: boolean;
  event: HabitStageEvent | null;
}

/** The Monday of a day key's week. */
export const readWeekKey = (dayKey: string) =>
  shiftKey(dayKey, -((new Date(toMs(dayKey)).getUTCDay() + 6) % WEEK_DAYS));

const daysBetween = (from: string, to: string) =>
  to < from
    ? []
    : Array.from(
        { length: Math.round((toMs(to) - toMs(from)) / 86_400_000) + 1 },
        (_, at) => shiftKey(from, at),
      );

/** The habit day it was last made, restarted or had a window changed. */
export function readLastStartKey(
  habit: Pick<LifeHabit, 'startsOn' | 'history' | 'windowState'>,
  timeZone: string,
): string {
  const instants = [
    ...(habit.history ?? [])
      .filter((event) => event.kind === 'restarted')
      .map((event) => event.at),
    ...Object.values(habit.windowState).flatMap((window) =>
      window.editedAt ? [window.editedAt] : [],
    ),
  ];
  return [
    toKey(habit.startsOn),
    ...instants.map((at) => habitDayKey(at, timeZone)),
  ].reduce((latest, key) => (key > latest ? key : latest));
}

const unitIds = (habit: LifeHabit) =>
  habit.timesPerDay !== null || Object.keys(habit.windowState).length === 0
    ? ['day']
    : Object.keys(habit.windowState);

type UnitState = {
  id: string;
  status: 'done' | 'skipped' | 'open';
  isUnreminded: boolean;
};

const readUnits = (habit: LifeHabit, day: LifeDay | undefined): UnitState[] => {
  const entry = day?.entries[habit.id];
  return unitIds(habit).map((id) => {
    const check = entry?.checks[id];
    const isTally = habit.timesPerDay !== null;
    const status = !entry
      ? 'open'
      : isTally
        ? entry.count >= habit.timesPerDay!
          ? 'done'
          : check?.status === 'skipped'
            ? 'skipped'
            : 'open'
        : check?.status === 'done' || check?.status === 'skipped'
          ? check.status
          : 'open';
    const doneAt = isTally ? (entry?.lastCountAt ?? null) : (check?.at ?? null);
    const remindedAt = entry?.reminded?.[id] ?? null;
    return {
      id,
      status,
      isUnreminded:
        status !== 'done' ||
        remindedAt === null ||
        doneAt === null ||
        remindedAt >= doneAt,
    };
  });
};

const isOpenDay = (
  habit: LifeHabit,
  key: string,
  spans: { from: string; to: string | null }[],
) =>
  toMs(key) >= habit.startsOn &&
  (habit.endsOn === null || toMs(key) <= habit.endsOn) &&
  !spans.some(
    (span) => key >= span.from && (span.to === null || key < span.to),
  );

/** The due times that count in `from` to `to` (inclusive day keys): known (checked, or the day was in use), not skipped, not paused, and after the last start. */
export function readOccurrences(
  habit: LifeHabit,
  days: Record<string, LifeDay>,
  from: string,
  to: string,
  timeZone: string,
): Occurrence[] {
  const spans = readPauseSpans(habit, timeZone);
  const lastStart = readLastStartKey(habit, timeZone);
  const keys = daysBetween(from > lastStart ? from : lastStart, to).filter(
    (key) => isOpenDay(habit, key, spans),
  );
  if (habit.cadence.kind !== 'timesPerWeek') {
    return keys
      .filter((key) => isDueOn(habit.cadence, key))
      .flatMap((key) =>
        readUnits(habit, days[key]).flatMap((unit) =>
          unit.status === 'skipped' ||
          (unit.status === 'open' && !days[key]?.isInUse)
            ? []
            : [
                {
                  dayKey: key,
                  unitId: unit.id,
                  isDone: unit.status === 'done',
                  isUnreminded: unit.isUnreminded,
                },
              ],
        ),
      );
  }
  const count = habit.cadence.count;
  const weeks = [...new Set(daysBetween(from, to).map(readWeekKey))];
  return weeks.flatMap((week) => {
    const weekKeys = daysBetween(week, shiftKey(week, WEEK_DAYS - 1));
    const isWhole =
      weekKeys.every((key) => isOpenDay(habit, key, spans)) &&
      week >= readWeekKey(lastStart) &&
      lastStart <= week;
    const doneDays = weekKeys.filter((key) =>
      readUnits(habit, days[key]).every((unit) => unit.status === 'done'),
    );
    const isDone = doneDays.length >= count;
    const isKnown = isDone || weekKeys.some((key) => days[key]?.isInUse);
    return isWhole || isDone
      ? isKnown
        ? [
            {
              dayKey: week,
              unitId: 'week',
              isDone,
              isUnreminded: doneDays.every((key) =>
                readUnits(habit, days[key]).every((unit) => unit.isUnreminded),
              ),
            },
          ]
        : []
      : [];
  });
}

const judgeWeek = (
  habit: LifeHabit,
  days: Record<string, LifeDay>,
  week: string,
  timeZone: string,
  weeksSinceStart: number,
): KeptWeek => {
  const skipped = {
    week,
    state: 'skipped' as const,
    isUnreminded: true,
    weeksSinceStart,
  };
  const spans = readPauseSpans(habit, timeZone);
  const weekKeys = daysBetween(week, shiftKey(week, WEEK_DAYS - 1));
  const isPaused = weekKeys.some((key) =>
    spans.some(
      (span) => key >= span.from && (span.to === null || key < span.to),
    ),
  );
  const known = readOccurrences(
    habit,
    days,
    week,
    shiftKey(week, WEEK_DAYS - 1),
    timeZone,
  );
  const minimum =
    habit.cadence.kind === 'timesPerWeek' ? 1 : HABIT_LIFE.minKnownDueTimes;
  if (isPaused || known.length < minimum) return skipped;
  const missed = known.filter((one) => !one.isDone).length;
  return {
    week,
    state:
      missed <=
      (habit.cadence.kind === 'timesPerWeek'
        ? 0
        : HABIT_LIFE.maxMissedInKeptWeek)
        ? 'kept'
        : 'unkept',
    isUnreminded: known
      .filter((one) => one.isDone)
      .every((one) => one.isUnreminded),
    weeksSinceStart,
  };
};

/** Each Monday-to-Sunday week from the last start (at most 16, ending before `upToWeek`'s Monday) judged kept, unkept or skipped. */
export function readKeptWeeks(
  habit: LifeHabit,
  days: Record<string, LifeDay>,
  upToWeek: string,
  timeZone: string,
): KeptWeek[] {
  const startWeek = readWeekKey(readLastStartKey(habit, timeZone));
  const earliest = shiftKey(upToWeek, -WEEK_DAYS * HABIT_LIFE.judgedWeeks);
  const first = startWeek > earliest ? startWeek : earliest;
  const count = Math.max(
    0,
    Math.round((toMs(upToWeek) - toMs(first)) / (WEEK_DAYS * 86_400_000)),
  );
  return Array.from({ length: count }, (_, at) => {
    const week = shiftKey(first, at * WEEK_DAYS);
    return judgeWeek(
      habit,
      days,
      week,
      timeZone,
      Math.round((toMs(week) - toMs(startWeek)) / (WEEK_DAYS * 86_400_000)) + 1,
    );
  });
}

interface Walk {
  stage: LifeStage;
  keptRun: number;
  unkeptRun: number;
  judged: KeptWeek[];
}

const isFormedReady = (judged: KeptWeek[]) => {
  const lookback = judged.slice(-HABIT_LIFE.formedLookback);
  const last = judged.slice(-HABIT_LIFE.formedUnreminded);
  return (
    lookback.length === HABIT_LIFE.formedLookback &&
    lookback.filter((week) => week.state === 'kept').length >=
      HABIT_LIFE.formedKept &&
    last.length === HABIT_LIFE.formedUnreminded &&
    last.every((week) => week.state === 'kept' && week.isUnreminded) &&
    judged[judged.length - 1].weeksSinceStart >=
      HABIT_LIFE.formedWeeksSinceStart
  );
};

const nextStage = (walk: Walk, canForm: boolean): LifeStage => {
  const isSettled = walk.stage === 'holding' || walk.stage === 'formed';
  if (isSettled && walk.unkeptRun >= HABIT_LIFE.slipUnkeptRun)
    return 'buildingAgain';
  if (!isSettled && walk.keptRun >= HABIT_LIFE.holdingKeptRun) return 'holding';
  return walk.stage === 'holding' && canForm && isFormedReady(walk.judged)
    ? 'formed'
    : walk.stage;
};

/** The stage the judged weeks, oldest first, lead to. A carer's habit has none; a health habit stops at Holding. */
export function readHabitStage(
  habit: Pick<LifeHabit, 'isCare' | 'forWhoId'>,
  keptWeeks: KeptWeek[],
): LifeStage | null {
  if (habit.forWhoId !== null) return null;
  return keptWeeks
    .filter((week) => week.state !== 'skipped')
    .reduce<Walk>(
      (walk, week) => {
        const moved: Walk = {
          ...walk,
          keptRun: week.state === 'kept' ? walk.keptRun + 1 : 0,
          unkeptRun: week.state === 'unkept' ? walk.unkeptRun + 1 : 0,
          judged: [...walk.judged, week],
        };
        const stage = nextStage(moved, !habit.isCare);
        return stage === walk.stage
          ? { ...moved, stage }
          : { stage, keptRun: 0, unkeptRun: 0, judged: moved.judged };
      },
      { stage: 'building', keptRun: 0, unkeptRun: 0, judged: [] },
    ).stage;
}

const buildPatch = (
  habit: LifeHabit,
  stage: LifeStage | null,
  stageWeek: string | null,
  timeZone: string,
): HabitStagePatch => {
  const isStageChange = stage !== habit.stage;
  const at = zonedDateTimeToEpoch(
    shiftKey(stageWeek ?? readWeekKey(toKey(habit.startsOn)), WEEK_DAYS),
    HABIT_DAY_ROLLOVER,
    timeZone,
  );
  return {
    stage,
    stageAt: isStageChange ? at : habit.stageAt,
    stageWeek,
    formedAt: stage === 'formed' ? (habit.formedAt ?? at) : null,
    rejudgeFrom: null,
    isStageChange,
    event:
      isStageChange && stage !== null
        ? { kind: 'stage', at, by: 'nomos', pace: null, stage }
        : null,
  };
};

const walkTo = (
  habit: LifeHabit,
  days: Record<string, LifeDay>,
  lastWeek: string,
  timeZone: string,
) =>
  readHabitStage(
    habit,
    readKeptWeeks(habit, days, shiftKey(lastWeek, WEEK_DAYS), timeZone),
  );

/** Judges `weekKey` (a finished week's Monday) once: null when a carer's habit or when `stageWeek` is already that week or later. */
export function judgeHabitWeek(
  habit: LifeHabit,
  days: Record<string, LifeDay>,
  weekKey: string,
  timeZone: string,
): HabitStagePatch | null {
  if (habit.forWhoId !== null) return null;
  if (habit.stageWeek !== null && habit.stageWeek >= weekKey) return null;
  return buildPatch(
    habit,
    walkTo(habit, days, weekKey, timeZone),
    weekKey,
    timeZone,
  );
}

/** Re-walks a habit whose `rejudgeFrom` is set over the weeks already judged. Always returns a patch that clears `rejudgeFrom`; `isStageChange` says whether the stage moved. A week older than the 16 read re-judges nothing. */
export function rejudgeHabit(
  habit: LifeHabit,
  days: Record<string, LifeDay>,
  timeZone: string,
): HabitStagePatch | null {
  if (habit.rejudgeFrom === null || habit.forWhoId !== null) return null;
  const { stageWeek } = habit;
  const isTooOld =
    stageWeek === null ||
    habit.rejudgeFrom <
      shiftKey(stageWeek, -WEEK_DAYS * (HABIT_LIFE.judgedWeeks - 1));
  return buildPatch(
    habit,
    isTooOld ? habit.stage : walkTo(habit, days, stageWeek, timeZone),
    stageWeek,
    timeZone,
  );
}

/** The `rejudgeFrom` a check, skip or tally for `dayKey` writes: the earlier week wins, and null when that day's week is not yet judged. */
export function readRejudgeFrom(
  current: string | null,
  dayKey: string,
  stageWeek: string | null,
): string | null {
  const week = readWeekKey(dayKey);
  if (stageWeek === null || week > stageWeek) return current;
  return current !== null && current < week ? current : week;
}
