import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  ArrowDown,
  CornerUpLeft,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  MessageSquare,
  Rocket,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { ClaudeMark, GitHubMark } from '@/components/BrandMarks';
import SectionDivider from '@/components/SectionDivider';
import IconTile from '@/ui/IconTile';
import { formatDateShortUTC } from '@/utils/formatUtils';

import raw from '@/../docs/conventions/pipeline-log.md?raw';

import { CARD_CLASS, LIST_CARD_CLASS } from './constants';
import { parsePipelineLog } from './pipelineCost';
import {
  getArrowLabel,
  getLaneEntry,
  getLaneSteps,
  getMapNode,
  getReturns,
  MAP_LANES,
  type MapNode,
} from './pipelineMap';

const RECENT_CHANGES = 15;
const LOG_ROWS = parsePipelineLog(raw);

const ICONS: Record<string, LucideIcon> = {
  owner: User,
  helpers: Users,
  inbox: Inbox,
  dashboard: LayoutDashboard,
  inboxIssue: Inbox,
  answers: MessageSquare,
  queue: ListOrdered,
  deploy: Rocket,
};

function NodeIcon({ id }: { id: string }) {
  if (id === 'session') return <ClaudeMark className='size-5' />;
  if (id === 'pr') return <GitHubMark className='size-5' />;
  const Icon = ICONS[id];
  return Icon ? <Icon className='size-5' /> : null;
}

function NodeCard({ node }: { node: MapNode }) {
  const returns = getReturns(node);
  return (
    <li className={join(CARD_CLASS, 'min-w-0 space-y-3')}>
      <div className='flex items-start gap-3'>
        <IconTile>
          <NodeIcon id={node.id} />
        </IconTile>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold'>{node.title}</h3>
          <p className='text-muted-foreground text-sm'>{node.does}</p>
        </div>
      </div>
      {node.parts ? (
        <ul className='border-border/60 space-y-1.5 border-t pt-3'>
          {node.parts.map((part) => (
            <li key={part.name} className='text-sm'>
              <span className='font-medium'>{part.name}</span>{' '}
              <span className='text-muted-foreground'>{part.does}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {returns.map(({ target, label }) => (
        <p
          key={target.id}
          className='text-muted-foreground flex items-start gap-2 text-sm'
        >
          <CornerUpLeft className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
          <span>
            Back to <span className='font-medium'>{target.title}</span>: {label}
          </span>
        </p>
      ))}
    </li>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className='text-muted-foreground flex items-center justify-center gap-2 py-2 text-xs'>
      <ArrowDown className='size-4 shrink-0' aria-hidden='true' />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

function Lane({ lane }: { lane: (typeof MAP_LANES)[number] }) {
  const steps = getLaneSteps(lane.id);
  const entry = getLaneEntry(lane.id);
  const entryFrom = entry ? getMapNode(entry.from) : undefined;
  return (
    <section className='space-y-1'>
      <SectionDivider label={lane.title} className='pb-2' />
      {entry && entryFrom ? (
        <p className='text-muted-foreground pb-1 text-center text-xs'>
          {entry.label}, from the {entryFrom.title.toLowerCase()}
        </p>
      ) : null}
      {steps.map((step, index) => {
        const previous = steps[index - 1];
        return (
          <div key={step[0]?.id}>
            {previous ? <Arrow label={getArrowLabel(previous, step)} /> : null}
            <ul
              className={join(
                'grid gap-3',
                step.length > 1 && 'sm:grid-cols-2',
              )}
            >
              {step.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function RecentChanges() {
  const [isExpanded, setIsExpanded] = useState(false);
  const rows = isExpanded ? LOG_ROWS : LOG_ROWS.slice(0, RECENT_CHANGES);

  return (
    <section className='space-y-3'>
      <div>
        <h2 className='text-base font-semibold'>Recent changes</h2>
        <p className='text-muted-foreground text-sm'>
          Every time the pipeline itself was changed, newest first.
        </p>
      </div>
      <ul className={LIST_CARD_CLASS}>
        {rows.map((row, index) => (
          <li key={`${row.date}-${index}`} className='space-y-1 px-4 py-3'>
            <p className='text-muted-foreground flex items-center justify-between gap-3 text-xs'>
              <span>
                {formatDateShortUTC(Date.parse(`${row.date}T00:00:00Z`))}
              </span>
              <span>
                {row.scope} · {row.outcome}
              </span>
            </p>
            <p className='text-sm'>{row.change}</p>
          </li>
        ))}
      </ul>
      {LOG_ROWS.length > RECENT_CHANGES ? (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='mx-auto flex'
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? 'Show fewer' : `Show all ${LOG_ROWS.length}`}
        </Button>
      ) : null}
    </section>
  );
}

/** A picture of how work moves through the pipeline, then what has changed in it lately. */
function PipelineMapView() {
  return (
    <div className='space-y-8'>
      <div className='space-y-6'>
        {MAP_LANES.map((lane) => (
          <Lane key={lane.id} lane={lane} />
        ))}
      </div>
      <RecentChanges />
    </div>
  );
}

export default PipelineMapView;
