import { dayKeyToMs, shiftDayKeyBy } from '@/utils/cadenceUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  selectHabitWeek,
  type HabitDayLike,
  type HabitScheduleLike,
} from '@apps/helm/engine/habitDay';
import type { Project } from '@apps/helm/types';

const DAY_MS = 86_400_000;
const WEEKS_SHOWN = 12;
const WEEKS_MIN = 4;

export type GoalStep = HabitScheduleLike & { id: string; createdAt: number };

const mondayOf = (key: string) =>
  shiftDayKeyBy(key, -((new Date(dayKeyToMs(key)).getUTCDay() + 6) % 7));

const formatDay = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(new Date(at));

/** Up to two short parts about a goal, built only from its regular step's check-ins and its milestones, never a percentage: this week against the step's cadence, or the weeks of the last twelve it was kept, then the last milestone reached or the next dated one. `habits` are the goal's habits that were not stopped. */
export function selectGoalEvidence(input: {
  habits: GoalStep[];
  days: Record<string, HabitDayLike>;
  milestoneState: Project['milestoneState'];
  milestones: Record<string, { title: string }>;
  todayKey: string;
  timeZone: string;
}): string[] {
  const { days, milestoneState, milestones, todayKey, timeZone } = input;
  const step = [...input.habits].sort(
    (left, right) =>
      Number(right.status === 'active') - Number(left.status === 'active') ||
      left.createdAt - right.createdAt,
  )[0];
  const thisMonday = mondayOf(todayKey);
  const week = step
    ? selectHabitWeek(step, days, todayKey, timeZone)
    : { done: 0, due: 0, skipped: 0 };
  const past = step
    ? Array.from({ length: WEEKS_SHOWN }, (_, index) => {
        const monday = shiftDayKeyBy(thisMonday, -7 * (index + 1));
        return selectHabitWeek(
          step,
          days,
          shiftDayKeyBy(monday, 6),
          timeZone,
          true,
        );
      }).filter((entry) => entry.due > 0)
    : [];
  const metWeeks = past.filter((entry) => entry.done >= entry.due).length;
  const weeksLine =
    past.length >= WEEKS_MIN && metWeeks > 0
      ? HELM_COPY.goalWeeksLine(metWeeks, past.length)
      : null;
  const stepPart = !step
    ? HELM_COPY.goalNoStep
    : week.due > 0
      ? HELM_COPY.habitsWeekLine(week.done, week.due)
      : weeksLine;
  const reached = Object.entries(milestoneState)
    .flatMap(([id, state]) =>
      state.doneAt !== null && milestones[id]
        ? [{ title: milestones[id].title, at: state.doneAt }]
        : [],
    )
    .sort((left, right) => right.at - left.at)[0];
  const todayMs = dayKeyToMs(todayKey);
  const next = Object.entries(milestoneState)
    .flatMap(([id, state]) =>
      state.doneAt === null &&
      state.date !== null &&
      state.date >= todayMs &&
      milestones[id]
        ? [{ title: milestones[id].title, day: state.date }]
        : [],
    )
    .sort((left, right) => left.day - right.day)[0];
  const milestonePart = reached
    ? HELM_COPY.goalLastReached(reached.title, formatDay(reached.at, timeZone))
    : next
      ? HELM_COPY.projectNextDue(
          next.title,
          Math.round((next.day - todayMs) / DAY_MS),
        )
      : null;
  return [
    stepPart,
    milestonePart ?? (stepPart === weeksLine ? null : weeksLine),
  ]
    .filter((part): part is string => part !== null)
    .slice(0, 2);
}
