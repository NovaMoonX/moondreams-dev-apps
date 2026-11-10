import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import SectionDivider from '@/components/SectionDivider';
import { useConnections } from '@/lib/connections/useConnections';
import { useAppSelector } from '@/store';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import PlannedCard from '@apps/helm/components/today/PlannedCard';
import SuggestedCard from '@apps/helm/components/today/SuggestedCard';
import SyncedCard from '@apps/helm/components/today/SyncedCard';
import SyncedSheet from '@apps/helm/components/today/SyncedSheet';
import type { SuggestionTarget } from '@apps/helm/components/today/SuggestionSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { findFreeGaps } from '@apps/helm/engine/planner';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { usePlanDay } from '@apps/helm/hooks/usePlanDays';
import type { OpenTask, PlanSlot, SyncedRecord } from '@apps/helm/types';
import {
  formatLength,
  formatSlotRange,
  getDayNoon,
  needsPlan,
  shiftDayKey,
  sortSlots,
} from '@apps/helm/utils/planDays';
import { buildPlanInput, type PlanSources } from '@apps/helm/utils/planInput';
import { getDayEvents, getLiveRecords } from '@apps/helm/utils/synced';

const FREE_GAP_MINUTES = 45;
const FULL_GAP_MINUTES = 30;
const MINUTE_MS = 60_000;

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

const getSummary = (events: number, planned: number, suggested: number) =>
  [
    events > 0 ? HELM_COPY.planEvents(events) : null,
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

  const records = useMemo(
    () => getLiveRecords(stored, grants, true),
    [stored, grants],
  );
  const events = useMemo(
    () => getDayEvents(records, getDayNoon(dayKey, timeZone), timeZone).events,
    [records, dayKey, timeZone],
  );
  const slots = sortSlots(day?.slots ?? {}).flatMap(({ id, slot }) => {
    const task = getTask(slot.taskId);
    return task && slot.status !== 'notToday' ? [{ id, slot, task }] : [];
  });
  const kept = slots.filter(({ slot }) => slot.status === 'kept');
  const suggested = slots.filter(({ slot }) => slot.status === 'suggested');
  const { input } = buildPlanInput(sources, dayKey);
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
        onOpen={() => onOpenSuggestion({ dayKey, slotId: id })}
      />
    );

  const isPlanned = !needsPlan(day);
  const outcome =
    suggested.length > 0 || !isPlanned
      ? null
      : isLate
        ? 'late'
        : !hasRoom
          ? 'full'
          : kept.length === 0
            ? 'nothing'
            : null;

  const planThisDay = () => {
    setIsPlanning(true);
    void plan(dayKey).finally(() => setIsPlanning(false));
  };

  return (
    <>
      <p className='text-muted-foreground text-[15px]'>
        {getSummary(events.length, kept.length, suggested.length)}
      </p>
      {timeline.length > 0 && (
        <div className='space-y-3'>
          {timeline.map((entry) => {
            if (entry.kind === 'event') {
              return (
                <SyncedCard
                  key={entry.record.id}
                  record={entry.record}
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
      {!isToday && !isPlanned && isReady && (
        <Button
          type='button'
          variant='outline'
          loading={isPlanning}
          onClick={planThisDay}
        >
          {HELM_COPY.planThisDay}
        </Button>
      )}
      <SyncedSheet
        record={openRecord}
        now={now}
        onClose={() => setOpenRecordId(null)}
      />
    </>
  );
}

export default DayPlan;
