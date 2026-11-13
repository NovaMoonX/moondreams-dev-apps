import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import ActionRow from '@/components/ActionRow';

interface FeatureOfferProps {
  /** What the person gets, as an outcome, not the setting's name. */
  title: string;
  /** One line: what turning it on takes, and that it may not apply. */
  body: string;
  /** What it covers beyond this thing, or why it asks here; null when there is nothing to say. */
  scope?: string | null;
  actionLabel: string;
  laterLabel: string;
  /** The small label above the title. */
  badge?: string;
  onAction: () => void;
  onLater: () => void;
  isBusy?: boolean;
  /** After "Not now": the same offer as one quiet row, so it stays in reach without asking again. */
  folded: {
    isFolded: boolean;
    icon: ReactNode;
    label: string;
    subtitle: string;
  };
}

/** A feature the person can turn on, offered as new (title, a caveat, its scope, an action and Not now) and folded to one row once put off. */
function FeatureOffer({
  title,
  body,
  scope = null,
  actionLabel,
  laterLabel,
  badge = 'New',
  onAction,
  onLater,
  isBusy = false,
  folded,
}: FeatureOfferProps) {
  if (folded.isFolded) {
    return (
      <ActionRow
        icon={folded.icon}
        label={folded.label}
        subtitle={folded.subtitle}
        isDisabled={isBusy}
        onClick={onAction}
      />
    );
  }
  return (
    <section
      aria-label={title}
      className='border-border bg-card space-y-3 rounded-2xl border p-4'
    >
      <div className='space-y-1'>
        <p className='text-primary text-xs font-semibold'>{badge}</p>
        <p className='font-semibold'>{title}</p>
        <p className='text-muted-foreground text-sm'>{body}</p>
        {scope !== null && (
          <p className='text-muted-foreground text-sm'>{scope}</p>
        )}
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='min-h-10'
          disabled={isBusy}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='min-h-10'
          disabled={isBusy}
          onClick={onLater}
        >
          {laterLabel}
        </Button>
      </div>
    </section>
  );
}

export default FeatureOffer;
