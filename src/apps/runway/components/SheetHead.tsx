import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Pencil } from 'lucide-react';

import HelpTip from '@/components/HelpTip';
import { MaskedText } from '@apps/runway/components/MaskedText';

interface SheetHeadProps {
  /** What the figure is ("Next payment", "Saved", "Left"). */
  label: string;
  /** A string has its amounts masked; a node (a range as one `SensitiveValue`) is drawn as given. */
  figure?: ReactNode;
  /** Small words after the figure ("of $600"). */
  suffix?: string;
  /** The one short fact under the figure. */
  fact?: string | null;
  /** A small dot before the fact: the bank updated this figure a moment ago. */
  isFactFresh?: boolean;
  /** A second muted line under the fact, for a detail that only some records carry. */
  secondFact?: string | null;
  /** A caveat about the figure (which end of a range it is planned at), behind a help icon. */
  help?: ReactNode;
  helpTitle?: string;
  /** Draws the figure in the muted colour, for a figure that is not money in play. */
  isFigureMuted?: boolean;
  /** Drops the label on a screen 500px tall or less, where a sheet has little room. */
  isLabelDroppedWhenShort?: boolean;
  /** Makes the figure a door to setting it: a pencil beside the figure and a pressed state on the figure. */
  onFigureTap?: () => void;
  figureAriaLabel?: string;
}

/** The top of a row's sheet: the figure large, what it is, and one short fact. */
function SheetHead({
  label,
  figure,
  suffix,
  fact,
  isFactFresh = false,
  secondFact,
  help,
  helpTitle,
  isLabelDroppedWhenShort = false,
  isFigureMuted = false,
  onFigureTap,
  figureAriaLabel,
}: SheetHeadProps) {
  const figureLine = figure && (
    <span className='block break-words'>
      <span
        className={join(
          'text-4xl font-semibold tracking-tight tabular-nums [@media(max-height:599px)]:text-3xl',
          isFigureMuted && 'text-muted-foreground',
        )}
      >
        {typeof figure === 'string' ? (
          <MaskedText>{figure}</MaskedText>
        ) : (
          figure
        )}
      </span>
      {suffix && (
        <span className='text-muted-foreground ml-2 text-base whitespace-nowrap'>
          <MaskedText>{suffix}</MaskedText>
        </span>
      )}
    </span>
  );
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
      {figureLine &&
        (onFigureTap ? (
          <Button
            type='button'
            variant='base'
            className="active:bg-primary/10 relative -mx-1 h-auto min-h-0 w-[calc(100%+0.5rem)] !justify-between gap-3 rounded-lg !px-1 !py-0 text-left font-normal whitespace-normal before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
            onClick={onFigureTap}
          >
            {figureLine}
            <Pencil
              className='text-muted-foreground h-4 w-4 shrink-0'
              aria-hidden='true'
            />
            {figureAriaLabel && (
              <span className='sr-only'>{figureAriaLabel}</span>
            )}
          </Button>
        ) : (
          figureLine
        ))}
      {fact && (
        <p className='text-muted-foreground text-sm break-words'>
          <span className='line-clamp-3'>
            {isFactFresh && (
              <span
                className='bg-success mr-1.5 inline-block size-1.5 rounded-full align-middle'
                aria-hidden='true'
              />
            )}
            <MaskedText>{fact}</MaskedText>
          </span>
        </p>
      )}
      {secondFact && (
        <p className='text-muted-foreground text-sm break-words'>
          <span className='line-clamp-2'>
            <MaskedText>{secondFact}</MaskedText>
          </span>
        </p>
      )}
    </div>
  );
}

export default SheetHead;
