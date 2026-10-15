import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';

import Stepper from '@/components/Stepper';
import { MAX_COOKED_SERVINGS } from '@apps/pinch/constants';
import { stepCookServings } from '@apps/pinch/utils/cooks';

export type CookRecordStatus = 'SAVING' | 'NEW' | 'EARLIER' | 'NONE';

const TITLES: Record<CookRecordStatus, string> = {
  SAVING: 'Marking as cooked…',
  NEW: 'Marked as cooked',
  EARLIER: 'Already in your cooking history',
  NONE: 'Not marked as cooked',
};

interface CookRecordProps {
  status: CookRecordStatus;
  servings: number;
  onServingsChange: (servings: number) => void;
  /** Null hides it; only a cook this screen wrote can be taken back. */
  undoState: 'READY' | 'PENDING' | 'FAILED' | null;
  onUndo: () => void;
  /** Null when marking can't happen here (the history is full). */
  onMark: (() => void) | null;
  problem: { text: string; isError: boolean } | null;
}

/** The finish panel's record of the cook: what was saved, the servings it was saved with, and its own Undo. */
function CookRecord({
  status,
  servings,
  onServingsChange,
  undoState,
  onUndo,
  onMark,
  problem,
}: CookRecordProps) {
  const isRecorded = status === 'NEW' || status === 'EARLIER';

  return (
    <section
      aria-label='Cooking history'
      className='bg-muted/50 border-border w-full rounded-2xl border'
    >
      <div role='status' className='flex min-h-14 items-center gap-3 px-4 py-2'>
        <span
          className={join(
            'flex size-6 shrink-0 items-center justify-center rounded-full',
            isRecorded
              ? 'bg-accent text-accent-foreground'
              : 'border-border border',
          )}
          aria-hidden='true'
        >
          {isRecorded && <Check className='h-3.5 w-3.5' />}
        </span>
        <span className='min-w-0 flex-1 font-medium text-balance'>
          {TITLES[status]}
        </span>
        {undoState === 'READY' && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className="relative -mr-2 h-8 shrink-0 px-2 underline after:absolute after:-inset-1 after:content-['']"
            onClick={onUndo}
          >
            Undo
          </Button>
        )}
        {undoState === 'PENDING' && (
          <span className='text-muted-foreground shrink-0 text-xs'>
            Undoing…
          </span>
        )}
        {status === 'NONE' && onMark && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className="relative -mr-1 h-9 shrink-0 rounded-full px-4 after:absolute after:-inset-0.5 after:content-['']"
            onClick={onMark}
          >
            Mark as cooked
          </Button>
        )}
      </div>
      {isRecorded && (
        <div className='border-border flex min-h-14 items-center justify-between gap-3 border-t px-4 py-2'>
          <span className='text-sm'>Servings made</span>
          <Stepper
            label='Servings made'
            value={servings}
            min={0}
            max={MAX_COOKED_SERVINGS}
            step={1}
            onChange={(next) =>
              onServingsChange(
                stepCookServings(servings, next > servings ? 1 : -1),
              )
            }
          />
        </div>
      )}
      {problem && (
        <p
          className={join(
            'border-border border-t px-4 py-3 text-sm',
            problem.isError ? 'text-destructive' : 'text-muted-foreground',
          )}
          role={problem.isError ? 'alert' : undefined}
        >
          {problem.text}
        </p>
      )}
    </section>
  );
}

export default CookRecord;
