import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';

interface InlineNoticeProps {
  /** A fact about how something is set up (info), a consequence that needs a look (warning), or good news (success). */
  tone: 'info' | 'warning' | 'success';
  children: ReactNode;
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

/** One explanation as its own tinted block with an icon and a hairline edge, so two kinds of text never sit together as one paragraph in a lighter colour. */
function InlineNotice({ tone, children }: InlineNoticeProps) {
  const { Icon, box, icon } = TONES[tone];

  return (
    <div
      className={join(
        'text-foreground flex items-start gap-2.5 rounded-xl border p-3 text-sm',
        box,
      )}
    >
      <Icon
        className={join('mt-0.5 h-4 w-4 shrink-0', icon)}
        aria-hidden='true'
      />
      <p className='min-w-0 text-pretty break-words'>{children}</p>
    </div>
  );
}

export default InlineNotice;
