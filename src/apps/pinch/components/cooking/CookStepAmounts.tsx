import { join } from '@moondreamsdev/dreamer-ui/utils';

import AppCheckbox from '@/components/AppCheckbox';
import {
  CookAmountButton,
  CookConversionLine,
} from '@apps/pinch/components/cooking/CookAmount';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import { orderDryFirst } from '@apps/pinch/utils/measuringTools';

/** A step's lines as flat rows, name on the left and amount on the right; with `onToggleAdded` each has a tick for what the person has put in, and the name beside it is its target. */
export function CookAmountRows({
  rows,
  className,
  added,
  onToggleAdded,
}: {
  rows: CookRow[];
  className?: string;
  added?: Record<string, boolean>;
  onToggleAdded?: (id: string, isAdded: boolean) => void;
}) {
  return (
    <ul className={join('divide-border divide-y', className)}>
      {rows.map((row) => (
        <li key={row.id}>
          <div className='flex items-baseline justify-between gap-3 py-1.5 text-sm sm:[@media(min-height:701px)]:py-2 sm:[@media(min-height:701px)]:text-base'>
            <label
              className={join(
                'flex min-w-0 items-baseline gap-2',
                onToggleAdded && 'cursor-pointer',
              )}
            >
              {onToggleAdded && (
                <span className='inline-flex shrink-0 self-center'>
                  <AppCheckbox
                    aria-label={`Added ${row.name}`}
                    isMark
                    checked={added?.[row.id] === true}
                    onCheckedChange={(checked) =>
                      onToggleAdded(row.id, checked === true)
                    }
                  />
                </span>
              )}
              <span className='min-w-0 wrap-break-word'>
                {row.name}
                {row.groupLabel && (
                  <span className='text-muted-foreground text-xs sm:[@media(min-height:701px)]:text-sm'>
                    {' '}
                    · {row.groupLabel}
                  </span>
                )}
              </span>
            </label>
            <CookAmountButton
              row={row}
              className={
                row.isMeasured
                  ? 'shrink-0 font-semibold whitespace-nowrap'
                  : 'text-muted-foreground max-w-[50%] text-right wrap-break-word'
              }
            />
          </div>
          <CookConversionLine row={row} isCompact className='mb-1.5' />
        </li>
      ))}
    </ul>
  );
}

interface CookStepAmountsProps {
  /** The lines the step names, scaled. */
  rows: CookRow[];
  isAmountNoteShown: boolean;
  className?: string;
}

/** A step's own lines with their amounts, quieter than the instruction above them, and the note that amounts written in a scaled step stay as written. */
function CookStepAmounts({
  rows,
  isAmountNoteShown,
  className,
}: CookStepAmountsProps) {
  const { rows: ordered, hint } = orderDryFirst(rows);
  if (rows.length === 0) {
    return isAmountNoteShown ? (
      <p className={join('text-muted-foreground text-xs', className)}>
        Amounts written in this step stay as they are.
      </p>
    ) : null;
  }

  return (
    <section
      aria-label='For this step'
      className={join(
        'bg-muted/50 border-border rounded-2xl border px-4 py-3',
        className,
      )}
    >
      <p className='text-muted-foreground text-xs font-medium'>For this step</p>
      <CookAmountRows rows={ordered} className='mt-1' />
      {hint !== null && (
        <p className='text-muted-foreground pt-1 text-xs'>{hint}</p>
      )}
      {isAmountNoteShown && (
        <p className='text-muted-foreground border-border mt-1 border-t pt-2 text-xs'>
          Amounts written in this step stay as they are.
        </p>
      )}
    </section>
  );
}

export default CookStepAmounts;
