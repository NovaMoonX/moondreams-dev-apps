import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';

interface InlineNoticeProps {
  /** A fact about how something is set up (info), a consequence that needs a look (warning), or good news (success). */
  tone: 'info' | 'warning' | 'success';
  children: ReactNode;
  /** A short bold lead above the text. */
  title?: ReactNode;
  /** Draws a close button that calls it. */
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}

const TONES = {
  info: {
    Icon: Info,
    box: 'border-border bg-muted/60',
    icon: 'text-muted-foreground',
  },
  warning: {
    Icon: TriangleAlert,
    box: 'border-warning/50 bg-warning/15',
    icon: 'text-warning',
  },
  success: {
    Icon: CircleCheck,
    box: 'border-success/40 bg-success/10',
    icon: 'text-success',
  },
} as const;

/** One explanation as its own tinted block with an icon and a hairline edge, in the theme's own tokens so it reads in every app and both modes; the one notice for every app (Dreamer UI's `Callout` hard-codes dark-mode palette text). */
function InlineNotice({
  tone,
  children,
  title,
  onDismiss,
  dismissLabel = 'Dismiss',
  className,
}: InlineNoticeProps) {
  const { Icon, box, icon } = TONES[tone];

  return (
    <div
      className={join(
        'text-foreground flex items-start gap-2.5 rounded-xl border p-3 text-sm',
        box,
        className,
      )}
    >
      <Icon
        className={join('mt-0.5 h-4 w-4 shrink-0', icon)}
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1 text-pretty break-words'>
        {title && <p className='font-semibold'>{title}</p>}
        {typeof children === 'string' ? <p>{children}</p> : children}
      </div>
      {onDismiss && (
        <Button
          type='button'
          variant='tertiary'
          size='stripped'
          className="text-muted-foreground! relative -m-1 size-6 shrink-0 after:absolute after:-inset-2 after:content-['']"
          aria-label={dismissLabel}
          onClick={onDismiss}
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </Button>
      )}
    </div>
  );
}

export default InlineNotice;
