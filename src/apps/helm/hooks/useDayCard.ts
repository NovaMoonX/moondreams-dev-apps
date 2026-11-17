import { useMemo } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { describeFit, guessDuration, planDay } from '@apps/helm/engine/planner';
import { useFetchedTasks } from '@apps/helm/hooks/useFetchedTasks';
import { usePlanSources } from '@apps/helm/hooks/usePlanDays';
import {
  selectAllCaptures,
  selectOpenTasksById,
} from '@apps/helm/store/selectors/captureSelectors';
import type { OpenDayAims, OpenTask, PlanSlot } from '@apps/helm/types';
import {
  readAimResult,
  readCarryOver,
  readDayCardMode,
  type AimResult,
} from '@apps/helm/utils/dayCard';
import { formatClock, shiftDayKey } from '@apps/helm/utils/planDays';
import {
  buildPlanInput,
  findOverlaps,
  toPlannerTask,
} from '@apps/helm/utils/planInput';
import { HELM_COPY } from '@apps/helm/constants';

const MINUTE_MS = 60_000;

export interface AimRow {
  taskId: string;
  task: OpenTask;
  title: string;
  /** The task's length, or the planner's guess for one with none. */
  minutes: number | null;
  /** What the planner assumes for a task with no length; null once it has one. */
  guessMinutes: number | null;
  isDone: boolean;
  /** "11:00 AM", or null when it has no time. */
  timeLabel: string | null;
  doesntFit: boolean;
  slotId: string | null;
  /** The event a kept slot now overlaps, by title, with its ref. */
  overlap: { title: string; eventRef: string | null; isNew: boolean } | null;
  result: AimResult;
  choice: 'tomorrow' | 'later' | 'dropped' | null;
  reason: OpenDayAims['windDown'][string]['reason'];
}

export interface CarryRow {
  taskId: string;
  title: string;
  minutes: number | null;
}

/** Everything the day card draws, as of the minute: its view, yesterday's leftovers, the aims with their times and the line about whether they fit. Null until the days and the person's settings have opened. */
export function useDayCard(now: number) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const nowMinute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const sources = usePlanSources(nowMinute);
  const { dayAims, planDays } = useAppSelector((state) => state.helm);
  const openById = useAppSelector(selectOpenTasksById);
  const captures = useAppSelector(selectAllCaptures);
  const todayKey = sources?.todayKey ?? '';
  const yesterdayKey = todayKey ? shiftDayKey(todayKey, -1) : '';
  const today = dayAims.byId[todayKey] ?? null;
  const yesterday = dayAims.byId[yesterdayKey] ?? null;
  const wantedIds = [
    ...new Set([
      ...(today?.aims ?? []).map((aim) => aim.taskId),
      ...(yesterday?.aims ?? []).map((aim) => aim.taskId),
    ]),
  ];
  const fetched = useFetchedTasks(
    uid,
    wantedIds.filter((id) => !openById.has(id)).sort(),
  );

  const model = useMemo(() => {
    if (!sources || !dayAims.isLoaded || !planDays.isLoaded) return null;
    const { profile, timeZone } = sources;
    const dayStart = zonedDateTimeToEpoch(
      todayKey,
      profile.dayStartTime,
      timeZone,
    );
    const dayEnd = zonedDateTimeToEpoch(todayKey, profile.dayEndTime, timeZone);
    const mode = readDayCardMode({
      day: today,
      now: nowMinute,
      dayStart,
      dayEnd,
    });
    const tasks = new Map(
      [...fetched, ...openById.values()].map((t) => [t.id, t]),
    );
    const titleOf = (task: OpenTask) =>
      task.isUnreadable ? HELM_COPY.unreadable : task.title;
    const carry: CarryRow[] = readCarryOver(yesterday, today, (id) =>
      openById.has(id),
    ).flatMap((aim) => {
      const task = openById.get(aim.taskId);
      return task && !task.isUnreadable
        ? [
            {
              taskId: aim.taskId,
              title: task.title,
              minutes: task.durationMinutes,
            },
          ]
        : [];
    });

    const { input } = buildPlanInput(sources, todayKey);
    const result = planDay(input, (taskId) => taskId);
    const stored = planDays.byId[todayKey] ?? null;
    const storedByTask = new Map<string, { id: string; slot: PlanSlot }>(
      Object.entries(stored?.slots ?? {}).map(([id, slot]) => [
        slot.taskId,
        { id, slot },
      ]),
    );
    const computedByTask = new Map<string, PlanSlot>(
      Object.values(result.slots).map((slot) => [slot.taskId, slot]),
    );
    const overlaps = findOverlaps(input);
    const snapshot = stored?.calendarSnapshot ?? [];
    const isRest = result.outcome === 'rest';
    const unplaced = new Set(result.unplaced);
    const rows: AimRow[] = [...(today?.aims ?? [])]
      .sort((first, second) => first.order - second.order)
      .flatMap((aim) => {
        const task = tasks.get(aim.taskId);
        const entry = today?.windDown[aim.taskId] ?? null;
        if (!task) return [];
        const held = storedByTask.get(aim.taskId);
        const slot =
          held && held.slot.status !== 'notToday'
            ? held.slot
            : (computedByTask.get(aim.taskId) ?? null);
        const isDone = task.status === 'done';
        const minutes = task.durationMinutes;
        const flagged = held?.slot.overlapsEventRef ?? null;
        const overlapTitle =
          held && overlaps[held.id]
            ? overlaps[held.id]
            : (snapshot.find((event) => event.eventRef === flagged)?.title ??
              null);
        return [
          {
            taskId: aim.taskId,
            task,
            title: titleOf(task),
            minutes,
            guessMinutes:
              minutes === null
                ? guessDuration(
                    toPlannerTask(task),
                    sources.finishedTasks ?? [],
                  )
                : null,
            isDone,
            timeLabel:
              slot && slot.startAt !== null
                ? formatClock(slot.startAt, timeZone)
                : null,
            doesntFit: !isRest && !slot && unplaced.has(aim.taskId),
            slotId: held?.id ?? null,
            overlap:
              held?.slot.status === 'kept' && overlapTitle !== null && !isDone
                ? {
                    title: overlapTitle,
                    eventRef: flagged,
                    isNew: flagged !== null,
                  }
                : null,
            result:
              entry && !isDone
                ? entry.result
                : readAimResult({
                    isDone,
                    slot: held?.slot ?? computedByTask.get(aim.taskId) ?? null,
                    minutes,
                    now: nowMinute,
                    dayEnd,
                  }),
            choice: entry?.choice ?? null,
            reason: entry?.reason ?? null,
          },
        ];
      });
    const wanted = rows.filter((row) => row.choice === null);
    const fitLine =
      wanted.length === 0 || isRest || result.outcome === 'past'
        ? null
        : describeFit(
            Object.fromEntries(wanted.map((row) => [row.taskId, row.title])),
            result.unplaced.filter((id) =>
              wanted.some((row) => row.taskId === id),
            ),
            result.blockers,
          );
    return {
      mode,
      todayKey,
      yesterdayKey,
      today,
      carry,
      rows,
      wanted,
      fitLine,
      isRest,
      timeZone,
      dayEnd,
      plannedCount: wanted.filter((row) => row.timeLabel !== null || row.isDone)
        .length,
      hasPlan: stored !== null && stored.generatedAt !== null,
    };
  }, [
    sources,
    dayAims.isLoaded,
    planDays,
    todayKey,
    yesterdayKey,
    today,
    yesterday,
    fetched,
    openById,
    nowMinute,
  ]);

  const latestFiling =
    captures
      .filter((capture) => capture.aimsDayKey === todayKey && todayKey !== '')
      .at(-1) ?? null;
  const filing =
    latestFiling === null || today?.state === 'answered'
      ? 'none'
      : latestFiling.status === 'received' ||
          latestFiling.status === 'interpreting'
        ? latestFiling.hasPendingWrites && !navigator.onLine
          ? 'offline'
          : 'filing'
        : latestFiling.status === 'sorted'
          ? 'none'
          : 'failed';

  return { uid, model, filing } as const;
}
