import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Workflow } from 'lucide-react';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useState } from 'react';

import StatTile from '@/components/StatTile';
import type { PipelineState } from '@/hooks/usePipelineSync';

import { ClaudeMark, GitHubMark } from '@/components/BrandMarks';

import {
  CARD_CLASS,
  LIST_CARD_CLASS,
  SURFACE_CLASS,
  WAITING_TEXT_CLASS,
} from './constants';
import IconTile from '@/ui/IconTile';
import AnswerAllSubview from './AnswerAllSubview';
import { SentLine, StatusDot } from './PipelineParts';
import {
  formatPipelineTime,
  getAnswerSlots,
  getPartialFailureLine,
  type PipelineEntry,
  type PipelineGroup,
  type PipelineGroups,
} from './pipelineUtils';
import type { PipelineAnswers } from './usePipelineAnswers';

interface PipelineViewProps {
  pipeline: PipelineState;
  groups: PipelineGroups;
  now: number;
  answers: PipelineAnswers;
  onOpenEntry: (key: string) => void;
}

/** Waiting sessions shown before the rest fold behind "Show all". */
const WAITING_PREVIEW = 6;

const QUIET_SECTIONS: {
  key: Exclude<PipelineGroup, 'waiting'>;
  label: string;
}[] = [
  { key: 'working', label: 'Working' },
  { key: 'quiet', label: 'Quiet' },
  { key: 'finished', label: 'Finished' },
];

function PipelineView({
  pipeline,
  groups,
  now,
  answers,
  onOpenEntry,
}: PipelineViewProps) {
  const [isAnsweringAll, setIsAnsweringAll] = useState(false);
  const [isWaitingExpanded, setIsWaitingExpanded] = useState(false);
  const { sessions, inbox, isLoading, hasError, sessionsFailed, inboxFailed } =
    pipeline;

  const allEntries = [
    ...groups.waiting,
    ...groups.working,
    ...groups.quiet,
    ...groups.finished,
  ];
  const latestUpdate = Math.max(
    0,
    inbox?.updatedAt ?? 0,
    ...sessions.map((session) => session.updatedAt),
  );

  const getEmptyLine = () => {
    if (sessions.length === 0)
      return 'Your Claude Code sessions show up here as soon as their reporting key is set.';
    return 'Nothing active in the last few days.';
  };

  const getErrorText = () => {
    if (sessionsFailed && inboxFailed)
      return "Sessions and pull requests couldn't load.";
    return getPartialFailureLine(sessionsFailed);
  };

  const renderWaitingRow = (entry: PipelineEntry) => {
    const [firstAsk = ''] = entry.asks;
    const askCount = entry.asks.length;
    return (
      <li key={entry.key}>
        <Button
          type='button'
          variant='tertiary'
          className='h-auto w-full min-w-0 justify-start gap-3 rounded-none px-4 py-3 text-left font-normal'
          onClick={() => onOpenEntry(entry.key)}
        >
          <IconTile>
            {entry.isPrOnly ? (
              <GitHubMark className='size-5' />
            ) : (
              <ClaudeMark className='size-5' />
            )}
          </IconTile>
          <span className='min-w-0 flex-1'>
            <span className='text-foreground block truncate text-sm font-semibold'>
              {entry.name}
            </span>
            <span className='text-muted-foreground block truncate text-xs'>
              {firstAsk || 'Waiting on you'}
            </span>
            <span className='text-muted-foreground flex items-center gap-1.5 pt-0.5 text-xs'>
              <StatusDot group='waiting' />
              {entry.time}
              {askCount >= 2 ? ` · ${askCount} asks` : ''}
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
      </li>
    );
  };

  const renderRow = (entry: PipelineEntry, group: PipelineGroup) => (
    <li key={entry.key}>
      <Button
        type='button'
        variant='tertiary'
        className='h-auto w-full justify-start gap-3 px-0! py-3 text-left font-normal'
        onClick={() => onOpenEntry(entry.key)}
      >
        <StatusDot group={group} />
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block truncate text-sm font-medium'>
            {entry.name}
          </span>
          <span className='text-muted-foreground block truncate text-xs'>
            {entry.subtitle}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </li>
  );

  const renderSectionTitle = (label: string, count: number) => (
    <div className='flex items-baseline justify-between gap-3'>
      <h2 className='text-base font-semibold'>{label}</h2>
      <span className='text-muted-foreground text-sm tabular-nums'>
        {count}
      </span>
    </div>
  );

  const answerCount = groups.waiting
    .flatMap(getAnswerSlots)
    .filter((slot) => !answers.isSent(slot)).length;
  const isEmpty = allEntries.length === 0;
  const isUnknown = (isLoading || hasError) && isEmpty;
  const getFigure = (count: number) => (isUnknown ? '–' : count);

  return (
    <div className='max-w-3xl space-y-6'>
      {hasError ? (
        <p role='status' className='text-muted-foreground text-sm'>
          {getErrorText()}
        </p>
      ) : null}

      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <StatTile
          className={SURFACE_CLASS}
          label='Waiting'
          value={
            <span
              className={join(
                !isUnknown && groups.waiting.length > 0 && WAITING_TEXT_CLASS,
              )}
            >
              {getFigure(groups.waiting.length)}
            </span>
          }
        />
        <StatTile
          className={SURFACE_CLASS}
          label='Working'
          value={getFigure(groups.working.length)}
        />
        <StatTile
          className={SURFACE_CLASS}
          label='Quiet'
          value={getFigure(groups.quiet.length)}
        />
        <StatTile
          className={SURFACE_CLASS}
          label='Finished'
          value={getFigure(groups.finished.length)}
        />
      </div>

      {isLoading && isEmpty ? (
        <p className='text-muted-foreground text-sm'>Loading sessions…</p>
      ) : null}

      {isEmpty && !isLoading && !hasError ? (
        <div className={join(CARD_CLASS, 'flex items-center gap-4')}>
          <IconTile>
            <Workflow className='size-5' />
          </IconTile>
          <div className='min-w-0'>
            <p className='text-sm font-medium'>Nothing in the pipeline yet</p>
            <p className='text-muted-foreground text-sm'>{getEmptyLine()}</p>
          </div>
        </div>
      ) : null}

      {groups.waiting.length > 0 ? (
        <section className='space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <div className='flex items-baseline gap-2'>
              <h2 className='text-base font-semibold'>Waiting on you</h2>
              <span className='text-muted-foreground text-sm tabular-nums'>
                {groups.waiting.length}
              </span>
            </div>
            {answerCount > 0 ? (
              <Button
                type='button'
                variant='outline'
                size='sm'
                className="relative before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
                onClick={() => setIsAnsweringAll(true)}
              >
                Answer all ({answerCount})
              </Button>
            ) : null}
          </div>
          <SentLine sent={answers.lastSent} />
          <ul className={LIST_CARD_CLASS}>
            {(isWaitingExpanded
              ? groups.waiting
              : groups.waiting.slice(0, WAITING_PREVIEW)
            ).map(renderWaitingRow)}
          </ul>
          {groups.waiting.length > WAITING_PREVIEW ? (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='mx-auto flex'
              onClick={() => setIsWaitingExpanded((current) => !current)}
            >
              {isWaitingExpanded
                ? 'Show fewer'
                : `Show all ${groups.waiting.length}`}
            </Button>
          ) : null}
        </section>
      ) : null}

      {QUIET_SECTIONS.filter((section) => groups[section.key].length > 0).map(
        (section) => (
          <section key={section.key} className={CARD_CLASS}>
            {renderSectionTitle(section.label, groups[section.key].length)}
            <ul className='divide-border mt-1 -mb-3 divide-y'>
              {groups[section.key].map((entry) =>
                renderRow(entry, section.key),
              )}
            </ul>
          </section>
        ),
      )}

      {latestUpdate > 0 ? (
        <p className='text-muted-foreground text-center text-xs'>
          Updated {formatPipelineTime(latestUpdate, now)}
        </p>
      ) : null}

      {isAnsweringAll ? (
        <AnswerAllSubview
          entries={groups.waiting}
          answers={answers}
          onClose={() => setIsAnsweringAll(false)}
        />
      ) : null}
    </div>
  );
}

export default PipelineView;
