import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Workflow } from 'lucide-react';
import { useState } from 'react';

import StatTile from '@/components/StatTile';
import type { PipelineState } from '@/hooks/usePipelineSync';

import { CARD_CLASS } from './constants';
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

  const renderWaitingCard = (entry: PipelineEntry) => {
    const [firstAsk = ''] = entry.asks;
    const moreCount = entry.asks.length - 1;
    return (
      <li key={entry.key} className={`${CARD_CLASS} space-y-3`}>
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
        <EntryActions entry={entry} />
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

  return (
    <div className='max-w-3xl space-y-6'>
      {hasError ? (
        <p role='status' className='text-muted-foreground text-sm'>
          {getErrorText()}
        </p>
      ) : null}

      {isLoading ? (
        <p className='text-muted-foreground text-sm'>Loading sessions…</p>
      ) : (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <StatTile label='Waiting' value={groups.waiting.length} />
          <StatTile label='Working' value={groups.working.length} />
          <StatTile label='Quiet' value={groups.quiet.length} />
          <StatTile label='Finished' value={groups.finished.length} />
        </div>
      )}

      {isEmpty && !isLoading && !hasError ? (
        <div className={`${CARD_CLASS} flex items-center gap-4`}>
          <span
            className='bg-muted grid size-10 shrink-0 place-items-center rounded-xl'
            aria-hidden='true'
          >
            <Workflow className='text-muted-foreground size-5' />
          </span>
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
            <ul className='divide-border mt-1 divide-y'>
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
