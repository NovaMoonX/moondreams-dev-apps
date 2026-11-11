import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import FallbackImage from '@/components/FallbackImage';
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
  /** The card or account it was paid with, shown after the day. */
  paidWith?: string | null;
  /** What a row with no envelopes says instead of "Not counted". */
  emptyWhere?: string;
  onOpen: () => void;
}

/** One purchase in a list: its label, merchant or envelopes as the name, the day, the card or account and whichever of those the name left out, and the amount. A refund reads as money coming back. */
function PurchaseRow({
  purchase,
  looks,
  paidWith = null,
  emptyWhere,
  onOpen,
}: PurchaseRowProps) {
  const { isHidden } = useValuesHidden();
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';
  const refund = isRefund(purchase);
  const envelopes = describeEnvelopes(purchase.lines, nameOf);
  const firstName = purchase.lines[0]
    ? purchase.lines[0].envelopeId === null
      ? 'Free to Spend'
      : nameOf(purchase.lines[0].envelopeId)
    : '';
  const chosenCount = purchase.lines.filter(
    (line) => line.via !== 'spill',
  ).length;
  const shortEnvelopes =
    chosenCount > 1 ? `${firstName} and ${chosenCount - 1} more` : envelopes;
  const first = purchase.lines[0]?.envelopeId ?? null;
  const lead = first === null ? null : (looks.get(first) ?? null);
  const date = formatDateOrdinalUTC(purchase.date);
  const title = getPurchaseTitle(purchase, nameOf, isHidden);
  const detail = [
    date,
    ...(paidWith ? [paidWith] : []),
    ...getPurchaseFacts(purchase, shortEnvelopes, isHidden, emptyWhere),
  ].join(' · ');
  const amount = refund
    ? `+${formatCents(-purchase.amountCents)}`
    : formatCents(purchase.amountCents);

  const badge = (
    <ItemBadge name={lead?.name ?? title} emoji={lead?.emoji ?? null} />
  );
  return (
    <ItemRow
      name={title}
      leading={
        purchase.merchantLogo ? (
          <FallbackImage
            src={purchase.merchantLogo}
            alt=''
            aria-hidden='true'
            className='border-border size-10 shrink-0 rounded-xl border bg-white object-contain p-1'
            fallback={badge}
          />
        ) : (
          badge
        )
      }
      detail={detail}
      figure={amount}
      ariaLabel={`${title}, ${amount}, ${detail}. Open`}
      onOpen={onOpen}
    />
  );
}

export default PurchaseRow;
