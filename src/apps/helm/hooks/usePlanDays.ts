import { useCallback, useEffect, useMemo } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useConnections } from '@/lib/connections/useConnections';
import { store, useAppSelector } from '@/store';
import { dayKeyToMs } from '@/utils/cadenceUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  readImportanceOrder,
  readProjectPlaces,
  type ImportanceItem,
} from '@apps/helm/engine/importance';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { generatePlan } from '@apps/helm/store/actions/planActions';
import { selectImportanceItems } from '@apps/helm/store/selectors/importanceSelectors';
import {
  selectAvoidBuckets,
  type AvoidBucket,
} from '@apps/helm/store/selectors/patternSelectors';
import {
  selectAimTaskIdsByDay,
  selectFinishedTasks,
} from '@apps/helm/store/selectors/dayAimsSelectors';
import { selectActiveTasks } from '@apps/helm/store/selectors/taskSelectors';
import {
  formatDayWord,
  fromAwayKey,
  needsPlan,
  readTodayZone,
  toAwayKey,
  toDayKey,
} from '@apps/helm/utils/planDays';
import {
  buildPlanInput,
  findClashes,
  isCalendarHeld,
  type PlanSources,
} from '@apps/helm/utils/planInput';
import type { FinishedTask } from '@apps/helm/engine/planner';
import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import type {
  HelmProfile,
  OpenPlace,
  OpenTask,
  PlanDay,
  SyncedRecord,
} from '@apps/helm/types';

const MINUTE_MS = 60_000;

interface SourceParts {
  awayKey: string | null;
  grants: ConnectionGrantWithId[];
  profile: HelmProfile | null;
  synced: SyncedRecord[];
  planDays: Record<string, PlanDay>;
  tasks: OpenTask[];
  places: OpenPlace[];
  importanceItems: ImportanceItem[];
  avoidBuckets: AvoidBucket[];
  aimTaskIds: Record<string, string[]>;
  finishedTasks: FinishedTask[];
  now: number;
}

const toSources = (parts: SourceParts): PlanSources | null => {
  const { profile, now, awayKey, importanceItems, ...rest } = parts;
  if (!profile) return null;
  const timeZone = readTodayZone(
    now,
    {
      timeZone: profile.timeZone || getDeviceTimeZone() || 'UTC',
      zoneSpans: profile.zoneSpans,
    },
    fromAwayKey(awayKey),
  );
  const todayKey = toDayKey(now, timeZone);
  return {
    ...rest,
    profile,
    now,
    timeZone,
    todayKey,
    projectPlaces: readProjectPlaces(
      readImportanceOrder(importanceItems, dayKeyToMs(todayKey)),
    ),
  };
};

/** What the planner reads, as of this moment: for a tap or an effect, never for rendering. */
const readPlanSources = (grants: ConnectionGrantWithId[]) => {
  const state = store.getState();
  const now = Date.now();
  return toSources({
    grants,
    awayKey: toAwayKey(state.helm.who.items),
    profile: state.helm.profile,
    synced: state.helm.synced.items,
    planDays: state.helm.planDays.byId,
    tasks: selectActiveTasks(state, Math.floor(now / MINUTE_MS) * MINUTE_MS),
    places: state.helm.places.items,
    importanceItems: selectImportanceItems(state),
    avoidBuckets: selectAvoidBuckets(state),
    aimTaskIds: selectAimTaskIdsByDay(state),
    finishedTasks: selectFinishedTasks(state),
    now,
  });
};

/** What the planner reads, kept current for a screen that draws from it; `nowMinute` is the clock floored to a minute. */
export function usePlanSources(nowMinute: number) {
  const { grants } = useConnections({ readerAppId: 'helm' });
  const profile = useAppSelector((state) => state.helm.profile);
  const synced = useAppSelector((state) => state.helm.synced.items);
  const planDays = useAppSelector((state) => state.helm.planDays.byId);
  const tasks = useAppSelector((state) => selectActiveTasks(state, nowMinute));
  const places = useAppSelector((state) => state.helm.places.items);
  const importanceItems = useAppSelector(selectImportanceItems);
  const avoidBuckets = useAppSelector(selectAvoidBuckets);
  const aimTaskIds = useAppSelector(selectAimTaskIdsByDay);
  const finishedTasks = useAppSelector(selectFinishedTasks);
  const awayKey = useAppSelector((state) => toAwayKey(state.helm.who.items));
  return useMemo(
    () =>
      toSources({
        grants,
        awayKey,
        profile,
        synced,
        planDays,
        tasks,
        places,
        importanceItems,
        avoidBuckets,
        aimTaskIds,
        finishedTasks,
        now: nowMinute,
      }),
    [
      grants,
      awayKey,
      profile,
      synced,
      planDays,
      tasks,
      places,
      importanceItems,
      avoidBuckets,
      aimTaskIds,
      finishedTasks,
      nowMinute,
    ],
  );
}

/** Days already tried this session, so a plan that fails or finds nothing never loops. */
const attempted = new Set<string>();

/** Plans one day now, answering whether it was written: the planner's slots, reasons and snapshot are written in one batch. Never a past day, and nothing while the calendar can't be read, since a plan made then would ignore it. `isRestOverridden` plans a rest day anyway. */
type PlanResult = 'planned' | 'skipped' | 'failed';

export function usePlanDay() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { addToast } = useToast();
  const { grants, isKnown } = useConnections({ readerAppId: 'helm' });
  const isReady = useAppSelector(
    (state) =>
      state.helm.profile !== null &&
      state.helm.planDays.isLoaded &&
      state.helm.openTasks.isLoaded &&
      state.helm.synced.isLoaded,
  );

  const isFailing = isCalendarHeld(grants);

  const plan = useCallback(
    async (
      dayKey: string,
      isRestOverridden = false,
      isQuiet = false,
    ): Promise<PlanResult> => {
      const sources = readPlanSources(grants);
      if (!uid || !sources || dayKey < sources.todayKey) return 'skipped';
      if (isCalendarHeld(grants)) return 'skipped';
      try {
        const encryption = await getHelmEncryption(uid);
        await generatePlan(
          uid,
          encryption,
          buildPlanInput(sources, dayKey),
          sources.planDays[dayKey],
          formatDayWord(dayKey, sources.todayKey),
          isRestOverridden ? Date.now() : null,
        );
        return 'planned';
      } catch (error) {
        console.error('Day was not planned', error);
        if (!isQuiet) addToast({ title: HELM_COPY.planFailed, type: 'error' });
        return 'failed';
      }
    },
    [uid, grants, addToast],
  );

  return { plan, isReady: isReady && isKnown, uid, isFailing };
}

/** Plans today the first time Today shows it with no plan, once per day for the session. */
export function useAutoPlanToday(
  isShowingToday: boolean,
  sources: PlanSources | null,
) {
  const { plan, isReady, uid, isFailing } = usePlanDay();
  const todayKey = sources?.todayKey ?? null;
  const isUnplanned =
    todayKey !== null && needsPlan(sources?.planDays[todayKey]);
  const clashKey = useMemo(
    () =>
      sources && todayKey && !isUnplanned
        ? findClashes(sources, todayKey).join(',')
        : '',
    [sources, todayKey, isUnplanned],
  );

  useEffect(() => {
    const key = `${uid}|${todayKey}|${clashKey}`;
    const isDue = isUnplanned || clashKey !== '';
    if (!isShowingToday || !isReady || !uid || !todayKey || !isDue) return;
    if (isFailing || attempted.has(key)) return;
    attempted.add(key);
    void plan(todayKey);
  }, [
    isShowingToday,
    isReady,
    isFailing,
    uid,
    isUnplanned,
    clashKey,
    todayKey,
    plan,
  ]);
}

/** Plans the day a sorted turn asked for, on sight, once per turn. */
export function usePlanOnCapture(uid: string | null) {
  const { plan, isReady, isFailing } = usePlanDay();
  const captures = useAppSelector(
    (state) => state.helm.recentCaptures.captures,
  );
  const planDays = useAppSelector((state) => state.helm.planDays.byId);

  useEffect(() => {
    if (!uid || !isReady || isFailing) return;
    captures.forEach((capture) => {
      const key = capture.planDayKey ?? null;
      const handledKey = `capture|${uid}|${capture.id}`;
      if (
        key === null ||
        capture.sortedAt === null ||
        attempted.has(handledKey)
      ) {
        return;
      }
      attempted.add(handledKey);
      const day = planDays[key];
      const isStale =
        needsPlan(day) || (day?.generatedAt ?? 0) < (capture.sortedAt ?? 0);
      if (isStale) void plan(key);
    });
  }, [uid, isReady, isFailing, captures, planDays, plan]);
}
