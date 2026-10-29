import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import HelpTip from '@/components/HelpTip';
import { MaskedText } from '@apps/runway/components/MaskedText';

interface SheetHeadProps {
  /** What the figure is ("Next payment", "Saved", "Left"). */
  label: string;
  figure?: string;
  /** Small words after the figure ("of $600"). */
  suffix?: string;
  /** The one short fact under the figure. */
  fact?: string | null;
  /** A caveat about the figure (which end of a range it is planned at), behind a help icon. */
  help?: ReactNode;
  helpTitle?: string;
  /** Drops the label on a screen 500px tall or less, where a sheet has little room. */
  isLabelDroppedWhenShort?: boolean;
}

/** The top of a row's sheet: the figure large, what it is, and one short fact. */
function SheetHead({
  label,
  figure,
  suffix,
  fact,
  help,
  helpTitle,
  isLabelDroppedWhenShort = false,
}: SheetHeadProps) {
  return (
    <div className='border-border bg-accent rounded-2xl border p-4 [@media(max-height:599px)]:p-3'>
      <div
        className={join(
          'flex min-h-6 items-center gap-1',
          isLabelDroppedWhenShort && '[@media(max-height:499px)]:hidden',
        )}
      >
        <p className='text-muted-foreground text-sm font-medium'>
          {help ? (
            <>
              {label.split(' ').slice(0, -1).join(' ')}{' '}
              <span className='whitespace-nowrap'>
                {label.split(' ').slice(-1)}
                <span className='ml-1 inline-flex align-middle'>
                  <HelpTip title={helpTitle ?? label}>
                    {typeof help === 'string' ? (
                      <MaskedText>{help}</MaskedText>
                    ) : (
                      help
                    )}
                  </HelpTip>
                </span>
              </span>
            </>
          ) : (
            label
          )}
        </p>
      </div>
      {figure && (
        <p className='break-words'>
          <span className='text-4xl font-semibold tracking-tight tabular-nums [@media(max-height:599px)]:text-3xl'>
            <MaskedText>{figure}</MaskedText>
          </span>
          {suffix && (
            <span className='text-muted-foreground ml-2 text-base whitespace-nowrap'>
              <MaskedText>{suffix}</MaskedText>
            </span>
          )}
        </p>
      )}
      {fact && (
        <p className='text-muted-foreground text-sm break-words'>
          <span className='line-clamp-2'>
            <MaskedText>{fact}</MaskedText>
          </span>
        </p>
      )}
    </div>
  );
}

export default SheetHead;
