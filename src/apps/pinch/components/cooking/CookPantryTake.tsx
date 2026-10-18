import { useState } from 'react';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';

import ShowMoreButton from '@/components/ShowMoreButton';
import TickMark from '@/components/TickMark';
import type { PantryTake } from '@apps/pinch/hooks/usePantryTake';
import {
  getTakeAmountText,
  getTakenHeadline,
  type TakeGroup,
} from '@apps/pinch/utils/packages';
import { formatSize } from '@apps/pinch/utils/productFormat';

const SHOWN_FIRST = 3;
const HIDDEN_WORTH_A_BUTTON = 2;

interface CookPantryTakeProps {
  take: PantryTake;
}

const PILL_BUTTON =
  "relative -mr-1 h-9 shrink-0 rounded-full px-4 after:absolute after:-inset-0.5 after:content-['']";

/** The finish panel's offer to take what the recipe used out of the pantry: the lines it would take, one tick each, soonest date first; then, once taken, what came out and one Undo. It only draws when the person has packages of what was cooked, and never gets in the way of Done. */
function CookPantryTake({ take }: CookPantryTakeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { taken } = take;
  const lines: TakeGroup[] = taken === null ? take.groups : taken.groups;
  if (lines.length === 0) return null;

  const visible =
    isOpen || lines.length - SHOWN_FIRST <= HIDDEN_WORTH_A_BUTTON
      ? lines
      : lines.slice(0, SHOWN_FIRST);

  return (
    <section
      aria-label='Pantry'
      className='bg-muted/50 border-border w-full rounded-2xl border'
    >
      <div role='status' className='flex min-h-14 items-center gap-3 px-4 py-2'>
        {taken === null ? (
          <span
            aria-hidden='true'
            className='border-border size-[1.15em] shrink-0 rounded-full border'
          />
        ) : (
          <TickMark />
        )}
        <span className='min-w-0 flex-1 font-medium text-balance'>
          {taken === null
            ? 'Take it out of your pantry?'
            : getTakenHeadline(taken.groups)}
        </span>
        {taken === null ? (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className={PILL_BUTTON}
            loading={take.busy === 'TAKE'}
            disabled={take.busy !== null || take.chosenCount === 0 || !take.isReady}
            onClick={() => void take.take()}
          >
            Take out
          </Button>
        ) : take.busy === 'UNDO' ? (
          <span className='text-muted-foreground shrink-0 text-xs'>
            Undoing…
          </span>
        ) : (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className={PILL_BUTTON}
            onClick={() => void take.undo()}
          >
            Undo
          </Button>
        )}
      </div>
      <div className='border-border border-t'>
        <ul className='divide-border divide-y'>
          {visible.map((group) => (
            <li key={group.ingredientId}>
              {taken === null ? (
                <label className='flex min-h-12 w-full cursor-pointer items-start gap-3 px-4 py-2.5 select-none'>
                  <span className='mt-0.5 inline-flex shrink-0'>
                    <Checkbox
                      aria-label={`Take ${group.name} out`}
                      checked={!take.left.has(group.ingredientId)}
                      onCheckedChange={() => take.toggle(group.ingredientId)}
                    />
                  </span>
                  <GroupText group={group} />
                </label>
              ) : (
                <div className='flex min-h-12 items-start gap-3 px-4 py-2.5'>
                  <GroupText group={group} />
                </div>
              )}
            </li>
          ))}
        </ul>
        {visible.length < lines.length && (
          <div className='px-4'>
            <ShowMoreButton onClick={() => setIsOpen(true)}>
              Show {lines.length - visible.length} more
            </ShowMoreButton>
          </div>
        )}
      </div>
      {take.error && (
        <p
          role='alert'
          className='text-destructive border-border border-t px-4 py-3 text-sm'
        >
          {take.error}
        </p>
      )}
    </section>
  );
}

function GroupText({ group }: { group: TakeGroup }) {
  return (
    <span className='min-w-0 flex-1'>
      <span className='flex items-baseline justify-between gap-3'>
        <span className='min-w-0 text-sm wrap-break-word'>{group.name}</span>
        <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
          {getTakeAmountText(group)}
        </span>
      </span>
      <span className='text-muted-foreground block text-xs'>
        {group.packageCount === 1
          ? 'From 1 package'
          : `From ${group.packageCount} packages, the one that expires first first`}
        {group.short !== null &&
          `. ${formatSize(group.short.amount, group.short.unit)} more than you had`}
      </span>
    </span>
  );
}

export default CookPantryTake;
