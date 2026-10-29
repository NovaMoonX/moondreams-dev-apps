import SensitiveValue from '@/components/SensitiveValue';
import InlineNotice from '@/components/InlineNotice';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import { describeEnvelopeFigure } from '@apps/runway/utils/purchaseText';

const SHOWN = 3;

export interface EnvelopeChange {
  id: string;
  name: string;
  beforeCents: number;
  afterCents: number;
}

interface PurchaseEffectNoticeProps {
  changes: readonly EnvelopeChange[];
  /** How far Free to spend falls; negative when it rises. */
  freeDropCents: number;
  /** What a card will wait for, when the purchase is charged to one. */
  cardLine?: string | null;
}

const figure = (cents: number) => {
  const { value, word } = describeEnvelopeFigure('track', cents);
  return `${value} ${word}`;
};

/** Before a purchase is saved, what each envelope it touches has now and will have after, and what Free to spend does when it moves. */
function PurchaseEffectNotice({
  changes,
  freeDropCents,
  cardLine = null,
}: PurchaseEffectNoticeProps) {
  const { isHidden } = useValuesHidden();
  const isWorseOver = (change: EnvelopeChange) =>
    change.afterCents < 0 && change.afterCents < change.beforeCents;
  const isOver = changes.some(isWorseOver);
  if (
    changes.length === 0 &&
    cardLine === null &&
    (freeDropCents === 0 || isHidden)
  )
    return null;
  if (isHidden && isOver) return <NeedsALookRow />;

  const shown = [
    ...changes.filter(isWorseOver),
    ...changes.filter((change) => !isWorseOver(change)),
  ].slice(0, SHOWN);
  const rest = changes.length - shown.length;
  const freeLine =
    freeDropCents > 0
      ? `Free to spend drops by ${formatCents(freeDropCents)}.`
      : `Free to spend goes up by ${formatCents(-freeDropCents)}.`;

  return (
    <div role='status'>
      <InlineNotice tone={isOver ? 'warning' : 'info'}>
        {shown.length > 0 && (
          <ul className='space-y-1'>
            {shown.map((change) => (
              <li
                key={change.id}
                className='flex flex-wrap items-baseline justify-between gap-x-3'
              >
                <span className='min-w-0 font-medium break-words'>
                  {change.name}
                </span>
                <span className='tabular-nums'>
                  <SensitiveValue className='text-muted-foreground'>
                    {formatCents(change.beforeCents)}
                  </SensitiveValue>
                  {' → '}
                  <SensitiveValue className='font-semibold'>
                    {figure(change.afterCents)}
                  </SensitiveValue>
                </span>
              </li>
            ))}
          </ul>
        )}
        {rest > 0 && (
          <p className='text-muted-foreground mt-1'>and {rest} more</p>
        )}
        {freeDropCents !== 0 && !isHidden && <p className='mt-1'>{freeLine}</p>}
        {cardLine && (
          <p className='mt-1'>
            <MaskedText>{cardLine}</MaskedText>
          </p>
        )}
      </InlineNotice>
    </div>
  );
}

export default PurchaseEffectNotice;
