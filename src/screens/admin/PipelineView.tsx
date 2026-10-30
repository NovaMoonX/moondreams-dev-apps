import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Workflow } from 'lucide-react';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useState } from 'react';

import StatTile from '@/components/StatTile';
import type { PipelineState } from '@/hooks/usePipelineSync';

import {
  CARD_CLASS,
  SURFACE_CLASS,
  WAITING_EDGE_CLASS,
  WAITING_TEXT_CLASS,
} from './constants';
import IconTile from '@/ui/IconTile';
import AnswerAllSubview from './AnswerAllSubview';
import { EntryActions, SentLine, StatusDot } from './PipelineParts';
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
  const { sessions, inbox, isLoading, hasError, sessionsFailed, inboxFailed } =
    pipeline;

  const allEntries = [
    ...groups.waiting,
    ...groups.working,
    ...groups.quiet,
    ...groups.finished,
  ];
  // With no Answer all, the one solid button leads with the first entry that can be answered here.
  const leadKey = (
    groups.waiting.find((entry) => getAnswerSlots(entry).length > 0) ??
    groups.waiting[0]
  )?.key;
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

  const renderWaitingCard = (entry: PipelineEntry) => {
    const [firstAsk = ''] = entry.asks;
    const moreCount = entry.asks.length - 1;
    return (
      <li
        key={entry.key}
        className={join(CARD_CLASS, 'space-y-3', WAITING_EDGE_CLASS)}
      >
        <Button
          type='button'
          variant='tertiary'
          className='h-auto w-full justify-start gap-3 px-0! py-0 text-left font-normal'
          onClick={() => onOpenEntry(entry.key)}
        >
          <span className='min-w-0 flex-1 space-y-1'>
            <span className='text-foreground block truncate text-base font-semibold'>
              {entry.name}
            </span>
            <span className='text-muted-foreground flex items-center gap-2 text-xs'>
              <StatusDot group='waiting' />
              Waiting since {entry.time}
            </span>
            {firstAsk ? (
              <span className='text-foreground line-clamp-2 pt-1 text-sm'>
                {firstAsk}
              </span>
            ) : null}
            {moreCount > 0 ? (
              <span className='text-muted-foreground block text-xs font-medium'>
                +{moreCount} more
              </span>
            ) : null}
          </span>
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
        <EntryActions
          entry={entry}
          isFilled={answerCount === 0 && entry.key === leadKey}
          onAnswer={() => onOpenEntry(entry.key)}
        />
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
          {renderSectionTitle('Waiting on you', groups.waiting.length)}
          {answerCount > 0 ? (
            <Button
              type='button'
              variant='primary'
              className='w-full sm:w-auto'
              onClick={() => setIsAnsweringAll(true)}
            >
              Answer all ({answerCount})
            </Button>
          ) : null}
          <SentLine sent={answers.lastSent} />
          <ul className='space-y-3'>{groups.waiting.map(renderWaitingCard)}</ul>
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
