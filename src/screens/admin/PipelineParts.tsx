import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import {
  getEntryActions,
  type PipelineEntry,
  type PipelineGroup,
} from './pipelineUtils';

const DOT_CLASS: Record<PipelineGroup, string> = {
  waiting: 'bg-primary',
  working: 'bg-success',
  quiet: 'bg-warning',
  finished: 'bg-muted-foreground/40',
};

export function StatusDot({ group }: { group: PipelineGroup }) {
  return (
    <span
      aria-hidden='true'
      className={join('size-2 shrink-0 rounded-full', DOT_CLASS[group])}
    />
  );
}

/** The owner's next steps for an entry as buttons: they share a row when the labels fit and stack on the narrowest phones. */
export function EntryActions({ entry }: { entry: PipelineEntry }) {
  const actions = getEntryActions(entry);
  if (actions.length === 0) return null;
  return (
    <div
      className={join(
        'grid gap-2',
        actions.length > 1 && 'min-[380px]:grid-cols-2',
      )}
    >
      {actions.map((action, index) => (
        <Button
          key={action.label}
          href={action.href}
          target='_blank'
          rel='noreferrer'
          variant={index === 0 ? 'primary' : 'secondary'}
          className='w-full whitespace-nowrap'
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
