import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { PillRow } from '@/components/PillGroup';
import ModalFooterActions from '@/components/ModalFooterActions';
import Pill from '@/components/Pill';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import type { PlannerTask } from '@apps/helm/engine/planner';
import { HELM_COPY } from '@apps/helm/constants';
import {
  formatClock,
  formatDayWord,
  formatStripDay,
  getStripKeys,
  shiftDayKey,
} from '@apps/helm/utils/planDays';
import {
  getOpenings,
  type Opening,
  type PlanSources,
} from '@apps/helm/utils/planInput';

export type PlacementMode = 'main' | 'times' | 'days';

const OPENINGS_PER_DAY = 2;

interface PlacementBodyProps {
  mode: PlacementMode;
  sources: PlanSources;
  task: PlannerTask;
  /** The slot being moved, which doesn't count as taken while looking. */
  slotId: string | null;
  /** The slot found, on its own line; null when its time is in the chip. */
  headline: string | null;
  chip: string | null;
  assistantName: string;
  onModeChange: (mode: PlacementMode) => void;
  /** A day with no opening gets the task with no time. */
  onPlace: (dayKey: string, opening: Opening | null) => void;
}

/** What a suggested slot says and how it moves: the slot and why, then pills for other times today and tomorrow, then the days after. */
export function PlacementBody({
  mode,
  sources,
  task,
  slotId,
  headline,
  chip,
  assistantName,
  onModeChange,
  onPlace,
}: PlacementBodyProps) {
  const { todayKey, timeZone } = sources;
  const days = getStripKeys(todayKey).slice(2);
  const times = [todayKey, shiftDayKey(todayKey, 1)].flatMap((dayKey) =>
    getOpenings(sources, dayKey, task, slotId, OPENINGS_PER_DAY).map(
      (opening) => ({ dayKey, opening }),
    ),
  );
  const dayPills = (
    <PillRow label={HELM_COPY.planPickDay}>
      {days.map((dayKey) => (
        <Pill
          key={dayKey}
          isSelected={false}
          onClick={() =>
            onPlace(
              dayKey,
              getOpenings(sources, dayKey, task, slotId, 1)[0] ?? null,
            )
          }
        >
          {formatStripDay(dayKey)}
        </Pill>
      ))}
    </PillRow>
  );

  if (mode === 'days') return dayPills;
  if (mode === 'times') {
    return (
      <div className='space-y-3'>
        {times.length === 0 && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.planNoOpenings}
          </p>
        )}
        <PillRow label={HELM_COPY.planAnotherTime}>
          {times.map(({ dayKey, opening }) => (
            <Pill
              key={`${dayKey}|${opening.startAt}`}
              isSelected={false}
              onClick={() => onPlace(dayKey, opening)}
            >
              {HELM_COPY.planOpening(
                formatDayWord(dayKey, todayKey),
                formatClock(opening.startAt, timeZone),
              )}
            </Pill>
          ))}
          <Pill isSelected={false} onClick={() => onModeChange('days')}>
            {HELM_COPY.planPickDay}
          </Pill>
        </PillRow>
      </div>
    );
  }
  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <AssistantMark name={assistantName} />
        <span className='text-[13px] text-[var(--helm-verdigris)]'>
          {HELM_COPY.planSuggestedMark}
        </span>
      </div>
      {headline && (
        <p className='text-lg leading-6 font-semibold'>{headline}</p>
      )}
      {chip && (
        <p className='bg-muted text-muted-foreground inline-block max-w-full rounded-full px-3 py-1 text-[13px] text-pretty break-words'>
          {chip}
        </p>
      )}
    </div>
  );
}

interface PlacementFooterProps {
  mode: PlacementMode;
  /** What leaves the sheet from its first view: Not today on a suggestion, Back from Plan it. */
  leftAction: ReactNode;
  onModeChange: (mode: PlacementMode) => void;
  onKeep: () => void;
}

export function PlacementFooter({
  mode,
  leftAction,
  onModeChange,
  onKeep,
}: PlacementFooterProps) {
  return (
    <div className='px-6 pt-2 pb-3'>
      {mode === 'main' ? (
        <ModalFooterActions
          leftActions={leftAction}
          rightActions={
            <>
              <Button
                type='button'
                variant='outline'
                onClick={() => onModeChange('times')}
              >
                {HELM_COPY.planAnotherTime}
              </Button>
              <Button type='button' variant='primary' onClick={onKeep}>
                {HELM_COPY.planKeep}
              </Button>
            </>
          }
        />
      ) : (
        <ModalFooterActions
          cancelAction={
            <Button
              type='button'
              variant='tertiary'
              onClick={() => onModeChange(mode === 'days' ? 'times' : 'main')}
            >
              {HELM_COPY.planBack}
            </Button>
          }
          rightActions={null}
        />
      )}
    </div>
  );
}
