import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppSelector } from '@/store';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { PRIORITY_LABELS } from '@apps/runway/constants';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import type { EnvelopeSealed } from '@apps/runway/types';
import { describeFunding } from '@apps/runway/utils/fundingText';
import { describeEnvelopeFigure } from '@apps/runway/utils/purchaseText';

interface EnvelopeTileProps {
  itemId: string;
  envelope: EnvelopeSealed;
  /** What it holds now: assigned at Plan, left or over at Track. */
  cents: number;
  /** The pairing that sets its amount on some income days, said in the sheet. */
  pairedNote?: string | null;
  today: number;
  /** A tile on Home (the figure large, two to a row) or a row in a list. */
  look?: 'row' | 'tile';
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** An envelope: its name and its figure, which the level calls assigned, left or over. It opens the envelope's sheet. */
function EnvelopeTile({
  itemId,
  envelope,
  cents,
  pairedNote = null,
  today,
  look = 'row',
}: EnvelopeTileProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { value, word } = describeEnvelopeFigure(
    useAppSelector(selectLevel),
    cents,
  );
  const funding = capitalize(describeFunding(envelope.funding));
  const isOver = word === 'over';
  const open = () => setIsOpen(true);

  return (
    <>
      {look === 'tile' ? (
        <li>
          <Button
            type='button'
            variant='tertiary'
            className='border-border bg-card text-foreground! h-full min-h-28 w-full flex-col items-start justify-start gap-2 rounded-2xl border p-3! text-left font-normal whitespace-normal'
            aria-label={`${envelope.name}, ${value} ${word}. Open`}
            onClick={open}
          >
            <span className='flex w-full min-w-0 items-center gap-2'>
              <span className='max-[359px]:hidden [&>span]:size-8 [&>span]:rounded-lg [&>span]:text-base'>
                <ItemBadge name={envelope.name} emoji={envelope.emoji} />
              </span>
              <span className='min-w-0 flex-1 font-medium break-words'>
                <span className='line-clamp-2'>{envelope.name}</span>
              </span>
            </span>
            <span className='mt-auto block'>
              <span
                className={join(
                  'block text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums',
                  isOver && 'text-destructive',
                )}
              >
                {value}
              </span>
              <span className='text-muted-foreground block text-xs'>
                {word}
              </span>
            </span>
          </Button>
        </li>
      ) : (
        <ItemRow
          name={envelope.name}
          emoji={envelope.emoji}
          detail={funding}
          figure={value}
          figureWord={word}
          ariaLabel={`${envelope.name}, ${value} ${word}. ${funding}. Open`}
          onOpen={open}
        />
      )}
      {isOpen && (
        <ItemSheet
          itemId={itemId}
          kind='envelope'
          today={today}
          figureLabel={capitalize(word)}
          figure={value}
          facts={[
            `${PRIORITY_LABELS[envelope.priority]}. ${funding}`,
            pairedNote,
          ]}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default EnvelopeTile;
