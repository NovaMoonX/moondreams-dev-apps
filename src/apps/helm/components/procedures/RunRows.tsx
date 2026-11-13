import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import AppCheckbox from '@/components/AppCheckbox';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, ListPlus, Plus } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import Drawer from '@/components/Drawer';
import RevealChip from '@/components/RevealChip';
import SectionHeader from '@/components/SectionHeader';
import ShowMoreButton from '@/components/ShowMoreButton';
import TickMark from '@/components/TickMark';
import { formatDateShort } from '@/utils/formatUtils';
import { HELM_COPY, RUNS_ALL_MAX, RUNS_LISTED } from '@apps/helm/constants';
import AddRow from '@apps/helm/components/who/AddRow';
import StartRunSheet, {
  type RunTarget,
} from '@apps/helm/components/procedures/StartRunSheet';
import { useRuns } from '@apps/helm/hooks/useRuns';
import type { OpenRun } from '@apps/helm/types';
import {
  getRunBlocks,
  getRunProgress,
  type RunStep,
} from '@apps/helm/utils/runSteps';

interface RunsListProps {
  runs: OpenRun[];
  /** On a procedure's page a run is named by what it was for; on a trip, event or project, by the procedure. */
  variant: 'procedure' | 'thing';
  onOpen: (runId: string) => void;
}

/** One line per run: what it is, when it started or finished, and how far it got. */
export function RunsList({ runs, variant, onOpen }: RunsListProps) {
  return (
    <ul className='helm-card divide-border divide-y overflow-hidden'>
      {runs.map((run) => {
        const { done, total } = getRunProgress(run);
        const state =
          run.finishedAt !== null
            ? HELM_COPY.runFinished(formatDateShort(run.finishedAt))
            : HELM_COPY.runStartedOn(formatDateShort(run.startedAt));
        return (
          <li key={run.id}>
            <Button
              type='button'
              variant='tertiary'
              className='flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
              onClick={() => onOpen(run.id)}
            >
              <span className='min-w-0 flex-1'>
                <span className='text-foreground block text-[15px] leading-[21px] break-words'>
                  {variant === 'procedure'
                    ? run.attachedLabel
                      ? HELM_COPY.runFor(run.attachedLabel, null)
                      : HELM_COPY.runJustARun
                    : run.title || HELM_COPY.runUntitled}
                </span>
                <span className='text-muted-foreground block text-[13px] break-words'>
                  {HELM_COPY.runRowDetail(
                    state,
                    done,
                    total,
                    getRunBlocks(run).extras.length,
                  )}
                </span>
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

interface RunStepRowProps {
  step: RunStep;
  /** A finished run is for looking up: its ticks are shown, not tapped. */
  isReadOnly: boolean;
  onTick: (isDone: boolean) => void;
  /** Opens the step's own sheet; left out for a step that came with the procedure. */
  onOpen?: () => void;
}

/** One step of a run with its tick; a step added for this run alone opens its sheet. */
export function RunStepRow({
  step,
  isReadOnly,
  onTick,
  onOpen,
}: RunStepRowProps) {
  const isDone = step.doneAt !== null;
  const words = (
    <span className='min-w-0 flex-1 py-3'>
      <span
        className={join(
          'block text-[15px] leading-[21px] break-words',
          isDone && 'text-muted-foreground line-through',
        )}
      >
        {step.text}
      </span>
      {step.detail && (
        <span className='text-muted-foreground block text-[13px] break-words whitespace-pre-line'>
          {step.detail}
        </span>
      )}
    </span>
  );
  return (
    <li className='flex min-h-12 items-start gap-3 px-3'>
      <span className='flex h-12 w-5 shrink-0 items-center justify-center'>
        {isReadOnly ? (
          isDone ? (
            <TickMark className='text-xl' />
          ) : (
            <span
              aria-hidden='true'
              className='border-muted-foreground/60 size-5 rounded-full border-2'
            />
          )
        ) : (
          <AppCheckbox
            checked={isDone}
            onCheckedChange={(next) => onTick(Boolean(next))}
            aria-label={
              isDone
                ? HELM_COPY.markNotDone(step.text)
                : HELM_COPY.markDone(step.text)
            }
          />
        )}
      </span>
      {onOpen ? (
        <Button
          type='button'
          variant='tertiary'
          size='stripped'
          rounded='none'
          className='flex min-w-0 flex-1 items-center gap-2 text-left font-normal whitespace-normal focus-visible:-outline-offset-2'
          onClick={onOpen}
        >
          {words}
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
      ) : (
        words
      )}
    </li>
  );
}

interface RunExtraSheetProps {
  step: RunStep;
  /** False when the procedure is gone or already has the step. */
  canAddToProcedure: boolean;
  onAddToProcedure: () => void;
  onClose: () => void;
}

/** A step added for this run alone: what it says and the one thing that can be done with it, keeping it in the procedure. */
export function RunExtraSheet({
  step,
  canAddToProcedure,
  onAddToProcedure,
  onClose,
}: RunExtraSheetProps) {
  return (
    <Drawer isOpen onClose={onClose} title={HELM_COPY.runExtraSheetTitle}>
      <div className='space-y-4 pb-4'>
        <div className='space-y-1'>
          <p className='text-[15px] break-words'>{step.text}</p>
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.runExtraSheetHint}
          </p>
        </div>
        {canAddToProcedure && (
          <ActionGroup>
            <ActionRow
              isGrouped
              icon={<ListPlus aria-hidden='true' />}
              label={HELM_COPY.runAddToProcedure}
              subtitle={HELM_COPY.runAddToProcedureHint}
              onClick={() => {
                onAddToProcedure();
                onClose();
              }}
            />
          </ActionGroup>
        )}
      </div>
    </Drawer>
  );
}

interface RunsSectionProps {
  field: 'procedureId' | 'attachedTo.id';
  id: string;
  variant: RunsListProps['variant'];
  onOpen: (runId: string) => void;
  /** On a project or trip: always offers "Start a run" for it, even before it has one. */
  start?: RunTarget;
}

/** A procedure's, a project's or a trip's runs, the newest few with the rest behind "Show all runs"; with no `start`, nothing at all when there are none. */
export function RunsSection({
  field,
  id,
  variant,
  onOpen,
  start,
}: RunsSectionProps) {
  const [isAll, setIsAll] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const { runs, hasFailed } = useRuns(
    field,
    id,
    isAll ? RUNS_ALL_MAX : RUNS_LISTED + 1,
  );
  const shown = runs ?? [];
  if (!start && shown.length === 0 && !hasFailed) return null;
  const hasMore = shown.length > RUNS_LISTED;
  if (start && shown.length === 0 && !hasFailed)
    return (
      <>
        <AddRow
          label={HELM_COPY.runStart}
          onClick={() => setIsStarting(true)}
        />
        <StartRunSheet
          isOpen={isStarting}
          target={start}
          onClose={() => setIsStarting(false)}
          onStarted={onOpen}
        />
      </>
    );
  return (
    <section className='space-y-2'>
      <SectionHeader title={HELM_COPY.runsHeading} />
      {hasFailed && (
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.runsFailedLine}
        </p>
      )}
      {shown.length > 0 && (
        <RunsList
          runs={isAll ? shown : shown.slice(0, RUNS_LISTED)}
          variant={variant}
          onOpen={onOpen}
        />
      )}
      {(hasMore || isAll) && (
        <ShowMoreButton
          isOpen={isAll}
          onClick={() => setIsAll((open) => !open)}
        >
          {isAll ? HELM_COPY.runsShowFewer : HELM_COPY.runsShowAll}
        </ShowMoreButton>
      )}
      {start && (
        <div className='flex flex-wrap gap-2'>
          <RevealChip
            icon={<Plus className='size-4' aria-hidden='true' />}
            onClick={() => setIsStarting(true)}
          >
            {HELM_COPY.runStart}
          </RevealChip>
        </div>
      )}
      {start && (
        <StartRunSheet
          isOpen={isStarting}
          target={start}
          onClose={() => setIsStarting(false)}
          onStarted={onOpen}
        />
      )}
    </section>
  );
}
