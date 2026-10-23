import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import type { OpenPurchase } from '@apps/runway/types';
import { describeEnvelopes, isRefund } from '@apps/runway/utils/purchaseText';

interface PurchaseRowProps {
  purchase: OpenPurchase;
  looks: ReadonlyMap<string, { name: string; emoji: string | null }>;
}

/** One purchase in a list: where it was, the day, the envelopes it came out of and the amount. A refund reads as money coming back. */
function PurchaseRow({ purchase, looks }: PurchaseRowProps) {
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
    <li className='flex items-start gap-3 p-3'>
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
    </li>
  );
}

export default PurchaseRow;
