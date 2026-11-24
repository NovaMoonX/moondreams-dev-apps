import { Mail } from 'lucide-react';

import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import FallbackImage from '@/components/FallbackImage';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatCents } from '@/utils/moneyUtils';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { useWaitingBank } from '@apps/runway/hooks/useEmailPurchases';
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
  /** Only the day and the card or account: the screen's own title says the rest. */
  isBrief?: boolean;
  /** What it did to one envelope (minus out, plus back), shown in place of the whole purchase. */
  shareCents?: number | null;
  /** The running total under the figure ("$412.50 left"). */
  figureWord?: string | null;
  isFigureWordOver?: boolean;
  /** Facts added after the day ("By your rule"). */
  extraFacts?: readonly string[];
  /** Opens the purchase; a row without it draws no chevron. */
  onOpen?: () => void;
}

/** One purchase in a list: its label, merchant or envelopes as the name, the day, the card or account and whichever of those the name left out, and the amount. A refund reads as money coming back. */
function PurchaseRow({
  purchase,
  looks,
  paidWith = null,
  emptyWhere,
  isBrief = false,
  shareCents = null,
  figureWord = null,
  isFigureWordOver = false,
  extraFacts = [],
  onOpen,
}: PurchaseRowProps) {
  const { isHidden } = useValuesHidden();
  const bank = useWaitingBank(purchase);
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
  const facts = isBrief
    ? []
    : purchase.emailWaiting === true
      ? [
          bank.name === null
            ? EMAIL_WORDS.waitingShort
            : EMAIL_WORDS.waitingOn(bank.name),
        ]
      : getPurchaseFacts(purchase, shortEnvelopes, isHidden, emptyWhere);
  const detail = [
    date,
    ...(paidWith ? [paidWith] : []),
    ...facts,
    ...extraFacts,
  ].join(' · ');
  const amount =
    shareCents !== null
      ? shareCents > 0
        ? `+${formatCents(shareCents)}`
        : formatCents(-shareCents)
      : refund
        ? `+${formatCents(-purchase.amountCents)}`
        : formatCents(purchase.amountCents);

  const badge = (
    <ItemBadge name={lead?.name ?? title} emoji={lead?.emoji ?? null} />
  );
  return (
    <ItemRow
      name={title}
      nameMark={
        purchase.source === 'email' && (
          <>
            <Mail
              className='text-muted-foreground ml-1.5 inline h-3.5 w-3.5 align-[-2px]'
              aria-hidden='true'
            />
            <span className='sr-only'>{EMAIL_WORDS.fromEmail}</span>
          </>
        )
      }
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
      figureWord={figureWord}
      isFigureWordOver={isFigureWordOver}
      ariaLabel={`${title}, ${amount}, ${detail}${figureWord ? `, ${figureWord}` : ''}${onOpen ? '. Open' : ''}`}
      onOpen={onOpen}
    />
  );
}

export default PurchaseRow;
