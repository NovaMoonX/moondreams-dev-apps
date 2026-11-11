import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { House } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { readConnectorAppId } from '@/lib/connections/contract';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import CalendarFailedLine from '@apps/helm/components/today/CalendarFailedLine';
import FeedGroup from '@apps/helm/components/today/FeedGroup';
import PlannedCard from '@apps/helm/components/today/PlannedCard';
import RestDayLine from '@apps/helm/components/today/RestDayLine';
import SuggestedCard from '@apps/helm/components/today/SuggestedCard';
import SyncedCard from '@apps/helm/components/today/SyncedCard';
import SyncedSheet from '@apps/helm/components/today/SyncedSheet';
import type { SuggestionTarget } from '@apps/helm/components/today/SuggestionSheet';
import { HELM_COPY } from '@apps/helm/constants';
import {
  getCurrentPlaceEndsAt,
  readCurrentPlace,
} from '@apps/helm/engine/currentPlace';
import { findFreeGaps } from '@apps/helm/engine/planner';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import { usePlanDay } from '@apps/helm/hooks/usePlanDays';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { setCurrentPlace } from '@apps/helm/store/actions/planActions';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import type { OpenTask, PlanSlot, SyncedRecord } from '@apps/helm/types';
import {
  formatClock,
  formatDayName,
  formatLength,
  formatSlotRange,
  getDayNoon,
  needsPlan,
  shiftDayKey,
  sortSlots,
} from '@apps/helm/utils/planDays';
import {
  buildPlanInput,
  findOverlaps,
  isFailingCalendar,
  isStoppedCalendar,
  isLiveCalendar,
  type PlanSources,
} from '@apps/helm/utils/planInput';
import { getDayEvents, getLiveRecords } from '@apps/helm/utils/synced';

const FREE_GAP_MINUTES = 45;
const FULL_GAP_MINUTES = 30;
const MINUTE_MS = 60_000;
const FEED_MIN_ROWS = 2;

interface DayPlanProps {
  dayKey: string;
  sources: PlanSources;
  getTask: (taskId: string) => OpenTask | null;
  /** Ids of tasks ticked while the list is open. */
  heldIds: ReadonlySet<string>;
  onOpenTask: (taskId: string) => void;
  onOpenSuggestion: (target: SuggestionTarget) => void;
  onTick: (task: OpenTask) => void;
  onUndoTick: (taskId: string) => void;
  onSelectDay: (dayKey: string) => void;
}

type Entry =
  | { kind: 'event'; at: number; record: SyncedRecord }
  | { kind: 'slot'; at: number; id: string; slot: PlanSlot; task: OpenTask }
  | { kind: 'gap'; at: number; startAt: number; endAt: number };

const ORDER = { event: 0, slot: 1, gap: 2 } as const;

const getSummary = (
  events: number,
  planned: number,
  suggested: number,
  isNoCalendar: boolean,
) =>
  [
    isNoCalendar ? HELM_COPY.planNoCalendar : null,
    !isNoCalendar && events > 0 ? HELM_COPY.planEvents(events) : null,
    planned > 0 ? HELM_COPY.planPlanned(planned) : null,
    suggested > 0 ? HELM_COPY.planSuggested(suggested) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ') || HELM_COPY.planNoSummary;

/** One day from today on: its events, what was kept and suggested in time order, "Free" lines for room of 45 minutes or more, and what to do when nothing was suggested. */
function DayPlan({
  dayKey,
  sources,
  getTask,
  heldIds,
  onOpenTask,
  onOpenSuggestion,
  onTick,
  onUndoTick,
  onSelectDay,
}: DayPlanProps) {
  const assistantName = useAssistantName();
  const { nameOf, categoryLabelOf } = useSourceAppName();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const { plan, isReady } = usePlanDay();
  const [isPlanning, setIsPlanning] = useState(false);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const { grants } = useConnections({
    readerAppId: 'helm',
    includeEnded: true,
  });
  const stored = useAppSelector((state) => state.helm.synced.items);
  const { timeZone, todayKey, now, profile } = sources;
  const day = sources.planDays[dayKey];
  const isToday = dayKey === todayKey;

  // A calendar Google stopped sharing is left out until it is reconnected.
  const records = useMemo(
    () =>
      getLiveRecords(stored, grants, true).filter(
        (record) =>
          grants.find((grant) => grant.id === record.grantId)?.status !==
          'needsReconnect',
      ),
    [stored, grants],
  );
  const merged = useMemo(
    () => getDayEvents(records, getDayNoon(dayKey, timeZone), timeZone).merged,
    [records, dayKey, timeZone],
  );
  const allEvents = merged.map(({ record }) => record);
  const feedGroups = [
    ...allEvents
      .filter(
        (record) =>
          record.isAllDay && readConnectorAppId(record.connectorId) !== null,
      )
      .reduce(
        (groups, record) =>
          groups.set(`${record.connectorId}|${record.category}`, [
            ...(groups.get(`${record.connectorId}|${record.category}`) ?? []),
            record,
          ]),
        new Map<string, SyncedRecord[]>(),
      )
      .values(),
  ].filter((group) => group.length >= FEED_MIN_ROWS);
  const folded = new Set(feedGroups.flat().map((record) => record.id));
  const events = allEvents.filter((record) => !folded.has(record.id));
  const alsoInOf = (id: string | null) =>
    merged.find(({ record }) => record.id === id)?.alsoIn ?? [];
  const failingGrants = grants.filter(isFailingCalendar);
  const isFailing = failingGrants.length > 0;
  const isStopped =
    !grants.some(isLiveCalendar) &&
    grants.some(
      (grant) =>
        grant.connectorId === 'google:calendar' &&
        grant.status === 'needsReconnect',
    );
  const { input } = buildPlanInput(sources, dayKey);
  const isHeld = isFailing || grants.some(isStoppedCalendar);
  const restDay = isHeld ? null : input.restDay;
  const isHolding = isHeld || restDay !== null;
  const slots = sortSlots(day?.slots ?? {}).flatMap(({ id, slot }) => {
    const task = getTask(slot.taskId);
    const isHidden =
      slot.status === 'notToday' || (isHolding && slot.status === 'suggested');
    return task && !isHidden ? [{ id, slot, task }] : [];
  });
  const kept = slots.filter(({ slot }) => slot.status === 'kept');
  const suggested = slots.filter(({ slot }) => slot.status === 'suggested');
  const overlaps = findOverlaps(input);
  const busyForGaps = [
    ...input.busy,
    ...slots.flatMap(({ slot }) =>
      slot.startAt !== null && slot.endAt !== null
        ? [{ startAt: slot.startAt, endAt: slot.endAt, title: '' }]
        : [],
    ),
  ];
  const gapInput = { ...input, busy: busyForGaps };
  const gaps = input.hasCalendar
    ? findFreeGaps(gapInput, FREE_GAP_MINUTES)
    : [];
  const hasRoom =
    !input.hasCalendar || findFreeGaps(gapInput, FULL_GAP_MINUTES).length > 0;
  const isLate =
    isToday &&
    now >= zonedDateTimeToEpoch(dayKey, profile.dayEndTime, timeZone);

  const timeline: Entry[] = [
    ...events.map((record) => ({
      kind: 'event' as const,
      at: record.isAllDay ? -1 : (record.startAt ?? 0),
      record,
    })),
    ...slots.flatMap(({ id, slot, task }) =>
      slot.startAt === null
        ? []
        : [{ kind: 'slot' as const, at: slot.startAt, id, slot, task }],
    ),
    ...gaps.map((gap) => ({ kind: 'gap' as const, at: gap.startAt, ...gap })),
  ].sort((a, b) => a.at - b.at || ORDER[a.kind] - ORDER[b.kind]);
  const untimedKept = kept.filter(({ slot }) => slot.startAt === null);
  const untimedSuggested = suggested.filter(
    ({ slot }) => slot.startAt === null,
  );
  const reasonOf = (id: string) => day?.reasons[id] ?? null;
  const homePlace = sources.places.find((place) => place.isHome) ?? null;
  const homeTasks =
    isToday && homePlace
      ? sources.tasks.filter(
          (task) =>
            !task.isUnreadable &&
            task.placeIds.includes(homePlace.id) &&
            !slots.some(({ slot }) => slot.taskId === task.id) &&
            !Object.values(day?.slots ?? {}).some(
              (slot) => slot.taskId === task.id && slot.status === 'notToday',
            ),
        )
      : [];
  const home = readCurrentPlace(profile, sources.places, now);
  const isHome = home?.isHome === true;
  const openRecord =
    records.find((record) => record.id === openRecordId) ?? null;

  const renderSlot = (id: string, slot: PlanSlot, task: OpenTask) =>
    slot.status === 'kept' ? (
      <PlannedCard
        key={id}
        task={task}
        timeLine={
          slot.startAt !== null && slot.endAt !== null
            ? formatSlotRange(slot.startAt, slot.endAt, timeZone)
            : null
        }
        isDone={heldIds.has(task.id)}
        overlapTitle={overlaps[id] ?? null}
        onAnotherTime={() =>
          onOpenSuggestion({ dayKey, slotId: id, isMove: true })
        }
        onOpen={(opened) => onOpenTask(opened.id)}
        onTick={onTick}
        onUndoTick={onUndoTick}
      />
    ) : (
      <SuggestedCard
        key={id}
        title={task.isUnreadable ? HELM_COPY.unreadable : task.title}
        detail={[
          slot.startAt !== null && slot.endAt !== null
            ? formatSlotRange(slot.startAt, slot.endAt, timeZone)
            : null,
          reasonOf(id),
        ]
          .filter((part): part is string => part !== null)
          .join(' · ')}
        assistantName={assistantName}
        onOpen={() => onOpenSuggestion({ dayKey, slotId: id, isMove: false })}
      />
    );

  const isPlanned = !needsPlan(day);
  const outcome =
    suggested.length > 0 || !isPlanned || isHolding
      ? null
      : isLate
        ? 'late'
        : !hasRoom
          ? 'full'
          : kept.length === 0
            ? 'nothing'
            : null;

  const sayHome = (isThere: boolean) => {
    if (!user || !homePlace) return;
    const uid = user.uid;
    void getHelmEncryption(uid)
      .then((encryption) =>
        setCurrentPlace(
          uid,
          encryption,
          { id: homePlace.id, name: homePlace.name },
          timeZone,
          isThere,
        ),
      )
      .then(({ executionId, committed }) => {
        addToast({
          title: isThere ? HELM_COPY.homeToast : HELM_COPY.notHomeToast,
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void takeBack(uid, executionId).then((result) => {
                if (result.kind === 'offline') {
                  addToast({
                    title: HELM_COPY.undoNeedsConnectionTitle,
                    description: HELM_COPY.undoNeedsConnectionBody,
                    type: 'error',
                  });
                }
              }),
          },
        });
        return committed;
      })
      .catch((error: unknown) => {
        console.error('Helm home was not saved', error);
        addToast({ title: HELM_COPY.homeNotSaved, type: 'error' });
      });
  };

  const askLeft = async (time: string) => {
    const isConfirmed = await confirm({
      title: HELM_COPY.homeTillTitle(time),
      message: HELM_COPY.homeTillBody,
      confirmText: HELM_COPY.homeLeft,
    });
    if (isConfirmed) sayHome(false);
  };

  const homeSection = homeTasks.length > 0 && (
    <section className='space-y-3'>
      <SectionDivider
        label={
          <span className='whitespace-nowrap'>{HELM_COPY.planWhenHome}</span>
        }
        trailing={
          isHome && profile.currentPlace ? (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative gap-1.5 whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
              onClick={() => {
                if (!profile.currentPlace) return;
                void askLeft(
                  formatClock(
                    getCurrentPlaceEndsAt(profile.currentPlace.saidAt),
                    timeZone,
                  ),
                );
              }}
            >
              <House className='h-3.5 w-3.5 fill-current' aria-hidden />
              {HELM_COPY.planHomeTill(
                formatClock(
                  getCurrentPlaceEndsAt(profile.currentPlace.saidAt),
                  timeZone,
                ),
              )}
            </Button>
          ) : (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative gap-1.5 whitespace-nowrap after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
              onClick={() => sayHome(true)}
            >
              <House className='h-3.5 w-3.5' aria-hidden />
              {HELM_COPY.planImHome}
            </Button>
          )
        }
      />
      {homeTasks.map((task) => (
        <PlannedCard
          key={task.id}
          task={task}
          timeLine={null}
          isDone={heldIds.has(task.id)}
          overlapTitle={null}
          onAnotherTime={() => undefined}
          onOpen={(opened) => onOpenTask(opened.id)}
          onTick={onTick}
          onUndoTick={onUndoTick}
        />
      ))}
    </section>
  );

  const planThisDay = (isRestOverridden: boolean) => {
    setIsPlanning(true);
    void plan(dayKey, isRestOverridden).finally(() => setIsPlanning(false));
  };

  return (
    <>
      {isFailing && (
        <CalendarFailedLine grants={failingGrants} hasPlan={kept.length > 0} />
      )}
      <p className='text-muted-foreground text-[15px]'>
        {getSummary(events.length, kept.length, suggested.length, isStopped)}
      </p>
      {isHeld && !isFailing && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.calendarStoppedNoSuggestions}
        </p>
      )}
      {restDay !== null && (
        <RestDayLine
          kind={restDay}
          assistantName={assistantName}
          dayName={formatDayName(dayKey, todayKey)}
          isPlanning={isPlanning}
          onPlanAnyway={isReady ? () => planThisDay(true) : null}
        />
      )}
      {isHome && homeSection}
      {timeline.length > 0 && (
        <div className='space-y-3'>
          {timeline.map((entry) => {
            if (entry.kind === 'event') {
              return (
                <SyncedCard
                  key={entry.record.id}
                  record={entry.record}
                  alsoIn={alsoInOf(entry.record.id)}
                  timeZone={timeZone}
                  onOpen={(opened) => setOpenRecordId(opened.id)}
                />
              );
            }
            if (entry.kind === 'slot') {
              return renderSlot(entry.id, entry.slot, entry.task);
            }
            return (
              <p
                key={`gap-${entry.startAt}`}
                className='text-muted-foreground px-1 text-[13px]'
              >
                {HELM_COPY.planFree(
                  formatLength(
                    Math.round((entry.endAt - entry.startAt) / MINUTE_MS),
                  ),
                )}
              </p>
            );
          })}
        </div>
      )}
      {feedGroups.map((group) => (
        <FeedGroup
          key={`${group[0].connectorId}|${group[0].category}`}
          label={categoryLabelOf(group[0].connectorId, group[0].category)}
          appName={nameOf(group[0].connectorId)}
          records={group}
          onOpen={(opened) => setOpenRecordId(opened.id)}
        />
      ))}
      {untimedKept.length > 0 && (
        <section className='space-y-3'>
          <SectionDivider label={HELM_COPY.planAnyTime} />
          {untimedKept.map(({ id, slot, task }) => renderSlot(id, slot, task))}
        </section>
      )}
      {untimedSuggested.length > 0 && (
        <section className='space-y-3'>
          <SectionDivider label={HELM_COPY.planWorthDoing} />
          {untimedSuggested.map(({ id, slot, task }) =>
            renderSlot(id, slot, task),
          )}
        </section>
      )}
      {!isHome && homeSection}
      {outcome !== null && (
        <div className='flex items-center gap-3'>
          <p className='text-muted-foreground min-w-0 flex-1 text-[15px] text-pretty'>
            {outcome === 'late'
              ? HELM_COPY.planLate
              : outcome === 'full'
                ? HELM_COPY.planFull
                : HELM_COPY.planNothingFits}
          </p>
          {outcome === 'late' && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => onSelectDay(shiftDayKey(todayKey, 1))}
            >
              {HELM_COPY.planTomorrow}
            </Button>
          )}
        </div>
      )}
      {day?.isUnreadable && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.planUnreadable}
        </p>
      )}
      {!isToday && !isPlanned && isReady && !isHolding && (
        <Button
          type='button'
          variant='outline'
          loading={isPlanning}
          onClick={() => planThisDay(false)}
        >
          {HELM_COPY.planThisDay}
        </Button>
      )}
      <SyncedSheet
        record={openRecord}
        alsoIn={alsoInOf(openRecordId)}
        now={now}
        onClose={() => setOpenRecordId(null)}
      />
    </>
  );
}

export default DayPlan;
