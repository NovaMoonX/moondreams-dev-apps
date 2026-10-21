import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import Stepper from '@/components/Stepper';
import TickMark from '@/components/TickMark';
import { MAX_COOKED_SERVINGS } from '@apps/pinch/constants';
import { stepCookServings } from '@apps/pinch/utils/cooks';

export type CookRecordStatus = 'SAVING' | 'NEW' | 'EARLIER' | 'NONE';

const TITLES: Record<CookRecordStatus, string> = {
  SAVING: 'Marking as cooked…',
  NEW: 'Marked as cooked',
  EARLIER: 'Already in your cooking history',
  NONE: 'Not marked as cooked',
};

export interface CookRecordRow {
  id: string;
  /** "Servings made" for one recipe, the recipe's name on a plate. */
  label: string;
  servings: number;
  isRecorded: boolean;
}

interface CookRecordProps {
  status: CookRecordStatus;
  rows: CookRecordRow[];
  /** A caption over the rows when each row is a recipe. */
  caption: string | null;
  onServingsChange: (id: string, servings: number) => void;
  /** Null hides it; only a cook this screen wrote can be taken back. */
  undoState: 'READY' | 'PENDING' | 'FAILED' | null;
  onUndo: () => void;
  /** Null when nothing is left to mark here (each recipe is marked or its history is full). */
  onMark: (() => void) | null;
  problem: { text: string; isError: boolean } | null;
}

/** The finish panel's record of the cook: what was saved, the servings each recipe was saved with, and one Undo for all of it. */
function CookRecord({
  status,
  rows,
  caption,
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
        {isRecorded ? (
          <TickMark />
        ) : (
          <span
            aria-hidden='true'
            className='border-border size-[1.15em] shrink-0 rounded-full border'
          />
        )}
        <span className='min-w-0 flex-1 font-medium text-balance'>
          {TITLES[status]}
        </span>
        {undoState === 'READY' && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className="relative -mr-1 h-9 shrink-0 rounded-full px-4 after:absolute after:-inset-0.5 after:content-['']"
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
        {(status === 'NONE' || status === 'EARLIER') && onMark && (
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
        <div className='border-border border-t'>
          {caption && (
            <p className='text-muted-foreground px-4 pt-2.5 text-xs'>
              {caption}
            </p>
          )}
          <ul className='divide-border divide-y'>
            {rows.map((row) => (
              <li
                key={row.id}
                className={join(
                  'flex min-h-14 items-center justify-between gap-3 px-4 py-2',
                  caption !== null &&
                    'max-sm:flex-col max-sm:items-start max-sm:gap-1',
                )}
              >
                <span className='min-w-0 text-sm wrap-break-word'>
                  {row.label}
                </span>
                {row.isRecorded ? (
                  <Stepper
                    label={
                      caption === null
                        ? row.label
                        : `${caption} of ${row.label}`
                    }
                    value={row.servings}
                    min={0}
                    max={MAX_COOKED_SERVINGS}
                    step={1}
                    onChange={(next) =>
                      onServingsChange(
                        row.id,
                        stepCookServings(
                          row.servings,
                          next > row.servings ? 1 : -1,
                        ),
                      )
                    }
                  />
                ) : (
                  <span className='text-muted-foreground shrink-0 text-sm'>
                    Not marked
                  </span>
                )}
              </li>
            ))}
          </ul>
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
