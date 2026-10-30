import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Workflow } from 'lucide-react';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useState } from 'react';

import StatTile from '@/components/StatTile';
import type { PipelineState } from '@/hooks/usePipelineSync';

import { CARD_CLASS, SURFACE_CLASS } from './constants';
import IconTile from './IconTile';
import PipelineSheet from './PipelineSheet';
import { EntryActions, StatusDot } from './PipelineParts';
import {
  formatPipelineTime,
  type PipelineEntry,
  type PipelineGroup,
  type PipelineGroups,
} from './pipelineUtils';

interface PipelineViewProps {
  pipeline: PipelineState;
  groups: PipelineGroups;
  now: number;
}

const QUIET_SECTIONS: {
  key: Exclude<PipelineGroup, 'waiting'>;
  label: string;
}[] = [
  { key: 'working', label: 'Working' },
  { key: 'quiet', label: 'Quiet' },
  { key: 'finished', label: 'Finished' },
];

function PipelineView({ pipeline, groups, now }: PipelineViewProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { sessions, inbox, isLoading, hasError, sessionsFailed, inboxFailed } =
    pipeline;

  const allEntries = [
    ...groups.waiting,
    ...groups.working,
    ...groups.quiet,
    ...groups.finished,
  ];
  const openEntry = allEntries.find((entry) => entry.key === openKey) ?? null;
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
    return sessionsFailed
      ? "Sessions couldn't load."
      : "Pull requests couldn't load.";
  };

  const renderWaitingCard = (entry: PipelineEntry, index: number) => {
    const [firstAsk = ''] = entry.asks;
    const moreCount = entry.asks.length - 1;
    return (
      <li
        key={entry.key}
        className={join(
          CARD_CLASS,
          'space-y-3 border-l-2 border-l-indigo-500 dark:border-l-indigo-400',
        )}
      >
        <Button
          type='button'
          variant='tertiary'
          className='h-auto w-full justify-start gap-3 px-0! py-0 text-left font-normal'
          onClick={() => setOpenKey(entry.key)}
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
              <span className='text-muted-foreground block text-xs'>
                +{moreCount} more
              </span>
            ) : null}
          </span>
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
        <EntryActions entry={entry} isFilled={index === 0} />
      </li>
    );
  };

  const renderRow = (entry: PipelineEntry, group: PipelineGroup) => (
    <li key={entry.key}>
      <Button
        type='button'
        variant='tertiary'
        className='h-auto w-full justify-start gap-3 px-0! py-3 text-left font-normal'
        onClick={() => setOpenKey(entry.key)}
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

  const isEmpty = allEntries.length === 0;
  const isUnknown = isLoading || hasError;
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
                !isUnknown &&
                  groups.waiting.length > 0 &&
                  'text-indigo-600 dark:text-indigo-400',
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

      {isLoading ? (
        <p className='text-muted-foreground text-sm'>Loading sessions…</p>
      ) : null}

      {isEmpty && !isLoading && !hasError ? (
        <div className={`${CARD_CLASS} flex items-center gap-4`}>
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

      <PipelineSheet entry={openEntry} onClose={() => setOpenKey(null)} />
    </div>
  );
}

export default PipelineView;
