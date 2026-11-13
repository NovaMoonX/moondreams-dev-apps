import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import BackLink from '@/components/BackLink';
import { PillRow } from '@/components/PillGroup';
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
  /** Where the slot being moved starts now, so it isn't offered as another time. */
  currentStartAt: number | null;
  /** The slot found, on its own line; null when its time is in the chip. */
  headline: string | null;
  chip: string | null;
  assistantName: string;
  onModeChange: (mode: PlacementMode) => void;
  /** Leaves the times or days view; null when the host draws its own Back. */
  onBack: (() => void) | null;
  /** A day with no opening gets the task with no time. */
  onPlace: (dayKey: string, opening: Opening | null) => void;
}

/** What a suggested slot says and how it moves: the slot and why, then pills for other times today and tomorrow, then the days after. */
export function PlacementBody({
  mode,
  sources,
  task,
  slotId,
  currentStartAt,
  headline,
  chip,
  assistantName,
  onModeChange,
  onBack,
  onPlace,
}: PlacementBodyProps) {
  const { todayKey, timeZone } = sources;
  const days = getStripKeys(todayKey).slice(2);
  const times = [todayKey, shiftDayKey(todayKey, 1)].flatMap((dayKey) =>
    getOpenings(sources, dayKey, task, slotId, OPENINGS_PER_DAY + 1)
      .filter((opening) => opening.startAt !== currentStartAt)
      .slice(0, OPENINGS_PER_DAY)
      .map((opening) => ({ dayKey, opening })),
  );
  const backLink = onBack && <BackLink onBack={onBack} />;
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

  if (mode === 'days') {
    return (
      <div className='space-y-3'>
        {backLink}
        {dayPills}
      </div>
    );
  }
  if (mode === 'times') {
    return (
      <div className='space-y-3'>
        {backLink}
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
  /** What leaves the sheet from its first view: Not today on a suggestion. */
  leftAction: ReactNode;
  onModeChange: (mode: PlacementMode) => void;
  onKeep: () => void;
}

/** The first view's actions; the times and days views leave through their Back link. */
export function PlacementFooter({
  mode,
  leftAction,
  onModeChange,
  onKeep,
}: PlacementFooterProps) {
  if (mode !== 'main') return null;
  return (
    <div className='px-6 pt-2 pb-3'>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between'>
        {leftAction && (
          <div className='max-sm:[&>button]:w-full'>{leftAction}</div>
        )}
        <div className='flex gap-2 sm:justify-end'>
          <Button
            type='button'
            variant='outline'
            className='max-sm:flex-1'
            onClick={() => onModeChange('times')}
          >
            {HELM_COPY.planAnotherTime}
          </Button>
          <Button
            type='button'
            variant='primary'
            className='max-sm:flex-1'
            onClick={onKeep}
          >
            {HELM_COPY.planKeep}
          </Button>
        </div>
      </div>
    </div>
  );
}
