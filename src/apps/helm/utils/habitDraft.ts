import type { Cadence, Weekday } from '@/utils/cadenceUtils';
import {
  HABIT_LABEL_MAX,
  HABIT_PER_DAY_MAX,
  HABIT_WINDOWS_MAX,
  HELM_COPY,
} from '@apps/helm/constants';
import {
  dayPartWindows,
  HABIT_DAY_ROLLOVER,
  type ClockWindow,
  type DayPart,
} from '@apps/helm/engine/habitDay';
import type { HabitWindowState, OpenHabit } from '@apps/helm/types';

export type OftenKind = 'everyDay' | 'onWeekdays' | 'timesPerWeek';
export type WhenMode = 'parts' | 'anyTime' | 'count';

export interface DraftWindow {
  id: string;
  part: DayPart | null;
  label: string;
  start: string;
  end: string;
}

/** What the person is choosing for how often and when, before it becomes a habit's cadence and windows. */
export interface WhenDraft {
  often: OftenKind;
  weekdays: Weekday[];
  weekCount: number;
  mode: WhenMode;
  windows: DraftWindow[];
  perDay: number;
}

export const DAY_PARTS: readonly DayPart[] = [
  'morning',
  'midday',
  'afternoon',
  'evening',
  'bedtime',
];

const DEFAULT_WEEK_COUNT = 3;
const DEFAULT_PER_DAY = 3;
const EVERY_WEEKDAY: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const toMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

export const EMPTY_WHEN: WhenDraft = {
  often: 'everyDay',
  weekdays: [],
  weekCount: DEFAULT_WEEK_COUNT,
  mode: 'parts',
  windows: [],
  perDay: DEFAULT_PER_DAY,
};

/** A part of the day as a window on the person's own day. */
export const toPartWindow = (
  part: DayPart,
  profile: { dayStartTime: string; dayEndTime: string },
): DraftWindow => {
  const span: ClockWindow = dayPartWindows(profile)[part];
  return {
    id: part,
    part,
    label: HELM_COPY.habitPartLabels[part],
    start: span.start,
    end: span.end,
  };
};

export function toWhenDraft(habit: OpenHabit): WhenDraft {
  const windows = Object.entries(habit.windowState)
    .sort(([, left], [, right]) => left.order - right.order)
    .map(([id, window]): DraftWindow => ({
      id,
      part: window.part,
      label: habit.windows[id]?.label ?? '',
      start: window.start,
      end: window.end,
    }));
  const { cadence } = habit;
  return {
    often: cadence.kind === 'everyNDays' ? 'everyDay' : cadence.kind,
    weekdays: cadence.kind === 'onWeekdays' ? cadence.weekdays : [],
    weekCount:
      cadence.kind === 'timesPerWeek' ? cadence.count : DEFAULT_WEEK_COUNT,
    mode:
      habit.timesPerDay !== null
        ? 'count'
        : windows.length > 0
          ? 'parts'
          : 'anyTime',
    windows,
    perDay: habit.timesPerDay ?? DEFAULT_PER_DAY,
  };
}

/** A window runs inside the day or ends after midnight by the rollover at the latest. */
export const isValidWindow = (window: Pick<DraftWindow, 'start' | 'end'>) =>
  window.start !== '' &&
  window.end !== '' &&
  window.start !== window.end &&
  (toMinutes(window.end) > toMinutes(window.start) ||
    toMinutes(window.end) <= toMinutes(HABIT_DAY_ROLLOVER));

/** What blocks saving, as the line to show; null when the draft is whole. */
export function readWhenBlocker(draft: WhenDraft): string | null {
  if (draft.often === 'onWeekdays' && draft.weekdays.length === 0) {
    return HELM_COPY.habitWhenNeedsDay;
  }
  if (draft.mode !== 'parts') return null;
  if (draft.windows.length === 0) return HELM_COPY.habitWhenNeedsWindow;
  return draft.windows.every(isValidWindow)
    ? null
    : HELM_COPY.habitWhenBadWindow;
}

const toCadence = (draft: WhenDraft): Cadence =>
  draft.often === 'onWeekdays'
    ? { kind: 'onWeekdays', weekdays: draft.weekdays }
    : draft.often === 'timesPerWeek'
      ? { kind: 'timesPerWeek', count: draft.weekCount }
      : { kind: 'everyDay' };

/** The cadence, windows and count a habit stores for a whole draft; an everyNDays cadence the draft cannot say is kept as it was. */
export function fromWhenDraft(
  draft: WhenDraft,
  previous: Pick<OpenHabit, 'cadence' | 'windowState'> | null,
  now: number,
) {
  const windows =
    draft.mode === 'parts'
      ? [...draft.windows]
          .sort((left, right) => toMinutes(left.start) - toMinutes(right.start))
          .slice(0, HABIT_WINDOWS_MAX)
      : [];
  const windowState: Record<string, HabitWindowState> = Object.fromEntries(
    windows.map((window, order) => {
      const before = previous?.windowState[window.id];
      const isEdited =
        before !== undefined &&
        (before.start !== window.start || before.end !== window.end);
      return [
        window.id,
        {
          start: window.start,
          end: window.end,
          part: window.part,
          order,
          editedAt: isEdited ? now : (before?.editedAt ?? null),
        },
      ];
    }),
  );
  const keepsCadence =
    previous?.cadence.kind === 'everyNDays' && draft.often === 'everyDay';
  return {
    cadence: keepsCadence && previous ? previous.cadence : toCadence(draft),
    windowState,
    windows: Object.fromEntries(
      windows.map((window) => [
        window.id,
        {
          label: (
            window.label.trim() ||
            (window.part
              ? HELM_COPY.habitPartLabels[window.part]
              : window.start)
          ).slice(0, HABIT_LABEL_MAX),
        },
      ]),
    ),
    timesPerDay:
      draft.mode === 'count'
        ? Math.min(Math.max(Math.round(draft.perDay), 1), HABIT_PER_DAY_MAX)
        : null,
  };
}

export const WEEK_ORDER = EVERY_WEEKDAY;

/** "Every day", "Mon, Wed, Fri", "3 times a week". */
export function formatCadence(cadence: Cadence): string {
  if (cadence.kind === 'everyDay') return HELM_COPY.habitCadenceEveryDay;
  if (cadence.kind === 'timesPerWeek')
    return HELM_COPY.habitCadenceWeek(cadence.count);
  if (cadence.kind === 'everyNDays')
    return HELM_COPY.habitCadenceEveryN(cadence.days);
  return EVERY_WEEKDAY.filter((day) => cadence.weekdays.includes(day))
    .map((day) => HELM_COPY.habitWeekdaysShort[day])
    .join(', ');
}
