import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';

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
      <ul className='divide-border mt-1 divide-y'>
        {rows.map((row) => (
          <li
            key={row.id}
            className='flex items-baseline justify-between gap-3 py-1.5 text-sm'
          >
            <span className='min-w-0 wrap-break-word'>
              {row.name}
              {row.groupLabel && (
                <span className='text-muted-foreground text-xs'>
                  {' '}
                  · {row.groupLabel}
                </span>
              )}
            </span>
            <span
              className={
                row.isMeasured
                  ? 'shrink-0 font-semibold whitespace-nowrap'
                  : 'text-muted-foreground max-w-[50%] text-right wrap-break-word'
              }
            >
              {row.amountText}
            </span>
          </li>
        ))}
      </ul>
      {isAmountNoteShown && (
        <p className='text-muted-foreground border-border mt-1 border-t pt-2 text-xs'>
          Amounts written in this step stay as they are.
        </p>
      )}
    </section>
  );
}

export default CookStepAmounts;
