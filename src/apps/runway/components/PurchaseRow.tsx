import { formatDateShortUTC } from '@/utils/formatUtils';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import type { OpenPurchase } from '@apps/runway/types';
import {
  describeEnvelopes,
  getPurchaseFacts,
  getPurchaseTitle,
  isRefund,
} from '@apps/runway/utils/purchaseText';

interface PurchaseRowProps {
  purchase: OpenPurchase;
  looks: ReadonlyMap<string, { name: string; emoji: string | null }>;
  onOpen: () => void;
}

/** One purchase in a list: its label, merchant or envelopes as the name, the day and whichever of those the name left out, and the amount. A refund reads as money coming back. */
function PurchaseRow({
  purchase,
  looks,
  onOpen,
}: PurchaseRowProps) {
  const { isHidden } = useValuesHidden();
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const refund = isRefund(purchase);
  const envelopes = describeEnvelopes(purchase.lines, nameOf);
  const firstName = purchase.lines[0]
    ? purchase.lines[0].envelopeId === null
      ? 'Free to spend'
      : nameOf(purchase.lines[0].envelopeId)
    : '';
  const shortEnvelopes =
    purchase.lines.length > 1
      ? `${firstName} and ${purchase.lines.length - 1} more`
      : envelopes;
  const first = purchase.lines[0]?.envelopeId ?? null;
  const lead = first === null ? null : (looks.get(first) ?? null);
  const date = formatDateShortUTC(purchase.date);
  const title = getPurchaseTitle(purchase, nameOf, isHidden);
  const detail = [
    date,
    ...getPurchaseFacts(purchase, shortEnvelopes, isHidden),
  ].join(' · ');
  const amount = refund
    ? `+${formatCents(-purchase.amountCents)}`
    : formatCents(purchase.amountCents);

  return (
    <ItemRow
      name={title}
      leading={
        <ItemBadge name={lead?.name ?? title} emoji={lead?.emoji ?? null} />
      }
      detail={detail}
      figure={amount}
      ariaLabel={`${title}, ${amount}, ${detail}. Open`}
      onOpen={onOpen}
    />
  );
}

export default PurchaseRow;
