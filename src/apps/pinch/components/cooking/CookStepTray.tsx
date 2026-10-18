import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import { CookAmountRows } from '@apps/pinch/components/cooking/CookStepAmounts';
import { getAmountsSummary } from '@apps/pinch/utils/cooks';

interface CookStepTrayProps {
  rows: CookRow[];
  isAmountNoteShown: boolean;
  className?: string;
}

function CookStepTray({
  rows,
  isAmountNoteShown,
  className,
}: CookStepTrayProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (rows.length === 0) {
    return isAmountNoteShown ? (
      <p className={join('text-muted-foreground text-xs', className)}>
        Amounts written in this step stay as they are.
      </p>
    ) : null;
  }

  const summary = getAmountsSummary(rows);
  const Chevron = isOpen ? ChevronDown : ChevronUp;

  return (
    <section
      aria-label='For this step'
      className={join(
        'bg-muted/50 border-border rounded-2xl border',
        className,
      )}
    >
      <Button
        type='button'
        variant='tertiary'
        aria-expanded={isOpen}
        aria-label={
          isOpen
            ? `${summary.caption}, close`
            : `${summary.caption}: ${summary.text}`
        }
        className={join(
          'text-foreground! h-auto w-full items-start justify-between gap-3 rounded-2xl px-4 py-2.5 text-left font-normal hover:bg-transparent',
          isOpen ? 'min-h-10' : 'min-h-14',
        )}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className='min-w-0 flex-1'>
          <span className='text-muted-foreground block text-xs font-medium'>
            {summary.caption}
          </span>
          {!isOpen && (
            <span className='mt-0.5 line-clamp-2 block text-sm wrap-break-word'>
              {summary.text}
            </span>
          )}
        </span>
        <Chevron
          className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      {isOpen && (
        <CookAmountRows
          rows={rows}
          className='border-border mx-4 border-t pb-1'
        />
      )}
      {isAmountNoteShown && (
        <p className='text-muted-foreground px-4 pb-3 text-xs'>
          Amounts written in this step stay as they are.
        </p>
      )}
    </section>
  );
}

export default CookStepTray;
