import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';

import SectionDivider from '@/components/SectionDivider';
import useNow from '@/hooks/useNow';
import type { PipelineState } from '@/hooks/usePipelineSync';

import PipelineSheet from './PipelineSheet';
import {
  buildPipeline,
  formatPipelineTime,
  type PipelineEntry,
} from './pipelineUtils';

interface PipelineViewProps {
  pipeline: PipelineState;
}

function PipelineView({ pipeline }: PipelineViewProps) {
  const now = useNow(60_000);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { sessions, inbox, isLoading, hasError } = pipeline;
  const groups = buildPipeline(sessions, inbox, now);

  const sections = [
    { key: 'waiting', label: 'Waiting on you', entries: groups.waiting },
    { key: 'working', label: 'Working', entries: groups.working },
    { key: 'quiet', label: 'Quiet', entries: groups.quiet },
    { key: 'idle', label: 'Idle', entries: groups.idle },
    { key: 'prs', label: 'On pull requests', entries: groups.prEntries },
  ].filter((section) => section.entries.length > 0);
  const allEntries = sections.flatMap((section) => section.entries);
  const openEntry = allEntries.find((entry) => entry.key === openKey) ?? null;
  const latestUpdate = Math.max(
    0,
    inbox?.updatedAt ?? 0,
    ...sessions.map((session) => session.updatedAt),
  );

  const getEmptyText = () => {
    if (isLoading) return 'Loading sessions…';
    if (sessions.length === 0)
      return 'Your Claude Code sessions show up here as soon as their reporting key is set.';
    return 'Nothing active in the last few days.';
  };

  const renderRow = (entry: PipelineEntry) => (
    <li key={entry.key}>
      <Button
        type='button'
        variant='tertiary'
        className='h-auto w-full justify-start gap-3 px-0! py-3 text-left font-normal'
        onClick={() => setOpenKey(entry.key)}
      >
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block truncate text-sm'>
            {entry.name}
          </span>
          <span className='text-muted-foreground line-clamp-1 text-xs'>
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

  return (
    <div className='max-w-3xl space-y-4'>
      {hasError ? (
        <p role='status' className='text-muted-foreground text-sm'>
          We couldn&apos;t load the pipeline just now.
        </p>
      ) : null}

      {sections.length === 0 && !hasError ? (
        <p className='text-muted-foreground text-sm'>{getEmptyText()}</p>
      ) : null}

      {sections.map((section) => (
        <Fragment key={section.key}>
          <SectionDivider label={section.label} />
          <ul className='divide-border divide-y'>
            {section.entries.map(renderRow)}
          </ul>
        </Fragment>
      ))}

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
