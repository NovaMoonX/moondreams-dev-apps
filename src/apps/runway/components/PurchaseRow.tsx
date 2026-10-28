import { Button } from '@moondreamsdev/dreamer-ui/components';

import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import type { OpenPurchase } from '@apps/runway/types';
import { describeEnvelopes, isRefund } from '@apps/runway/utils/purchaseText';

interface PurchaseRowProps {
  purchase: OpenPurchase;
  looks: ReadonlyMap<string, { name: string; emoji: string | null }>;
  onOpen: () => void;
}

/** One purchase in a list: where it was, the day, the envelopes it came out of and the amount. A refund reads as money coming back. */
function PurchaseRow({ purchase, looks, onOpen }: PurchaseRowProps) {
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const refund = isRefund(purchase);
  const named = purchase.merchant?.trim() || purchase.note?.trim() || null;
  const envelopes = describeEnvelopes(purchase.lines, nameOf);
  const first = purchase.lines[0]?.envelopeId ?? null;
  const lead = first === null ? null : (looks.get(first) ?? null);
  const date = formatDateUTC(purchase.date);
  const title =
    named ?? (refund ? `Refund to ${envelopes}` : envelopes || 'Purchase');
  const detail = named
    ? `${date}, ${refund ? 'refund to ' : ''}${envelopes}`
    : date;

  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto w-full items-start justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
        aria-label={`${title}, ${date}. Open`}
        onClick={onOpen}
      >
        <ItemBadge name={lead?.name ?? title} emoji={lead?.emoji ?? null} />
        <div className='min-h-10 min-w-0 flex-1'>
          <p className='line-clamp-2 font-medium break-words'>{title}</p>
          <p className='text-muted-foreground text-sm break-words'>{detail}</p>
        </div>
        <p className='shrink-0 pt-2 font-semibold whitespace-nowrap tabular-nums'>
          {refund
            ? `+${formatCents(-purchase.amountCents)}`
            : formatCents(purchase.amountCents)}
        </p>
      </Button>
    </li>
  );
}

export default PurchaseRow;
