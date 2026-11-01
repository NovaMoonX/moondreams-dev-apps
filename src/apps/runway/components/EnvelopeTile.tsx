import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import ItemBadge from '@apps/runway/components/ItemBadge';
import { useItemEmoji } from '@apps/runway/hooks/useItemEmoji';
import ItemRow, { type ItemRowReorder } from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { ITEM_SHEET_R2_WORDS, PRIORITY_LABELS } from '@apps/runway/constants';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import type { EnvelopeSealed } from '@apps/runway/types';
import {
  describeCadenceLine,
  describeFundingShort,
} from '@apps/runway/utils/fundingText';
import { formatCents } from '@/utils/moneyUtils';
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
  reorder?: ItemRowReorder;
  isHighlighted?: boolean;
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
  reorder,
  isHighlighted = false,
}: EnvelopeTileProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isHidden } = useValuesHidden();
  const level = useAppSelector(selectLevel);
  const { value, word } = describeEnvelopeFigure(level, cents);
  const funding = describeFundingShort(envelope.funding);
  const emoji = useItemEmoji(envelope.emoji, envelope.groupId);
  const { amount } = envelope.funding;
  const eachTime = amount.kind === 'exact' ? formatCents(amount.cents) : null;
  const isPlan = level === 'plan';
  const rowFigure = isPlan ? eachTime : value;
  const rowDetail = isPlan
    ? eachTime
      ? describeCadenceLine(envelope.funding.cadence)
      : funding
    : isHidden
      ? funding
      : `${capitalize(word)} · ${funding}`;
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
            aria-label={
              isHidden
                ? `${envelope.name}. Amount hidden. Open`
                : `${envelope.name}, ${value} ${word}. Open`
            }
            onClick={open}
          >
            <span className='flex w-full min-w-0 items-center gap-2'>
              <span className='max-[359px]:hidden [&>span]:size-8 [&>span]:rounded-lg [&>span]:text-base'>
                <ItemBadge name={envelope.name} emoji={emoji} />
              </span>
              <span className='min-w-0 flex-1 font-medium break-words'>
                <span className='line-clamp-2'>{envelope.name}</span>
              </span>
            </span>
            <span className='mt-auto block'>
              <span
                className={join(
                  'block text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums',
                  !isHidden && value.length >= 11 && 'max-[389px]:text-xl',
                  !isHidden && value.length >= 10
                    ? 'max-[359px]:text-lg'
                    : 'max-[359px]:text-xl',
                  isOver && !isHidden && 'text-destructive',
                )}
              >
                <SensitiveValue>{value}</SensitiveValue>
              </span>
              <span className='text-muted-foreground block text-xs'>
                {isHidden ? '\u00a0' : word}
              </span>
            </span>
          </Button>
        </li>
      ) : (
        <ItemRow
          name={envelope.name}
          emoji={emoji}
          detail={rowDetail}
          figure={rowFigure}
          ariaLabel={`${envelope.name}, ${isPlan ? funding : `${value} ${word}. ${funding}`}. Open`}
          onOpen={reorder ? undefined : open}
          reorder={reorder}
          isHighlighted={isHighlighted}
        />
      )}
      {isOpen && (
        <ItemSheet
          itemId={itemId}
          kind='envelope'
          today={today}
          figureLabel={
            isPlan
              ? eachTime
                ? describeCadenceLine(envelope.funding.cadence)
                : ITEM_SHEET_R2_WORDS.eachTime
              : isHidden
                ? ITEM_SHEET_R2_WORDS.balance
                : capitalize(word)
          }
          figure={isPlan ? (eachTime ?? undefined) : value}
          fact={[
            PRIORITY_LABELS[envelope.priority],
            isPlan && eachTime ? null : funding,
            envelope.maxCents === null
              ? null
              : ITEM_SHEET_R2_WORDS.stopsAt(formatCents(envelope.maxCents)),
            isPlan && cents !== 0 ? `${value} ${word}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          help={pairedNote}
          quickChange={{
            label: ITEM_SHEET_R2_WORDS.change,
            subtitle: ITEM_SHEET_R2_WORDS.changeAmountSub,
            step: 'amount',
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default EnvelopeTile;
