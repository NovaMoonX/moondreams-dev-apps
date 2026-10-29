import { useState } from 'react';
import { CreditCard } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import SectionDivider from '@/components/SectionDivider';
import SensitiveValue from '@/components/SensitiveValue';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { CARD_WORDS } from '@apps/runway/constants';
import {
  collectCardHistory,
  type CardHistoryEntry,
} from '@apps/runway/engine/cards';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { undoCardPayment } from '@apps/runway/store/actions/cardActions';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import {
  selectIsMovesLoaded,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

interface CardHistoryViewProps {
  cardId: string;
  /** What the card is called in a toast. */
  cardName: string;
  onOpenPurchase: (purchaseId: string) => void;
}

type Payment = Extract<CardHistoryEntry, { kind: 'payment' }>;

/** What one card was charged and paid since tracking began, newest first by month; a charge opens its purchase and a payment can be taken back. */
function CardHistoryView({
  cardId,
  cardName,
  onOpenPurchase,
}: CardHistoryViewProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const purchases = useAppSelector((state) => state.runway.purchases);
  const moves = useAppSelector((state) => state.runway.moves);
  const looks = useAppSelector(selectItemLooks);
  const isLoaded = useAppSelector(selectIsMovesLoaded);
  const recentFrom = useAppSelector(selectRecentFrom);
  const startDate = useAppSelector(
    (state) => state.runway.plan?.startDate ?? 0,
  );
  const [takingBack, setTakingBack] = useState<string | null>(null);

  const entries = collectCardHistory(cardId, purchases, moves).filter(
    (entry) => entry.on >= startDate,
  );
  const months = entries.reduce<{ label: string; rows: CardHistoryEntry[] }[]>(
    (groups, entry) => {
      const label = monthFormat.format(entry.on);
      const last = groups.at(-1);
      return last && last.label === label
        ? [...groups.slice(0, -1), { label, rows: [...last.rows, entry] }]
        : [...groups, { label, rows: [entry] }];
    },
    [],
  );
  const hasEarlier = recentFrom !== null && startDate < recentFrom;
  const nameOf = (envelopeId: string) =>
    looks.get(envelopeId)?.name ?? 'An envelope';

  const takeBack = async (payment: Payment) => {
    if (!user || takingBack !== null) return;
    const amount = formatCents(payment.cents);
    const day = formatDateShortUTC(payment.on);
    const isConfirmed = await confirm({
      title: CARD_WORDS.takeBackTitle,
      message: mask(CARD_WORDS.takeBackText(amount, day)),
      confirmText: CARD_WORDS.takeBackConfirm,
    });
    if (!isConfirmed) return;
    setTakingBack(payment.id);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await undoCardPayment(user.uid, encryption, {
        moveId: payment.id,
        cardId,
        date: payment.on,
        amountCents: payment.cents,
      });
      addToast({ title: CARD_WORDS.undone(cardName), type: 'success' });
    } catch (error) {
      addToast({
        title: CARD_WORDS.undoFailed,
        description: getErrorMessage(error, CARD_WORDS.failed),
        type: 'error',
      });
    }
    setTakingBack(null);
  };

  const renderRow = (entry: CardHistoryEntry) => {
    const day = formatDateShortUTC(entry.on);
    if (entry.kind === 'purchase') {
      const first = entry.purchase.lines[0]?.envelopeId ?? null;
      const title = getPurchaseTitle(entry.purchase, nameOf, isHidden);
      return (
        <ItemRow
          key={entry.id}
          name={title}
          leading={
            <ItemBadge
              name={title}
              emoji={first === null ? null : (looks.get(first)?.emoji ?? null)}
            />
          }
          detail={CARD_WORDS.historyCharged(day)}
          figure={`${entry.cents < 0 ? '−' : '+'}${formatCents(Math.abs(entry.cents))}`}
          ariaLabel={`${title}. Open`}
          onOpen={() => onOpenPurchase(entry.id)}
        />
      );
    }
    if (entry.kind === 'bill') {
      const look = looks.get(entry.billId);
      const title = look?.name ?? CARD_WORDS.historyUnknownBill;
      return (
        <ItemRow
          key={entry.id}
          name={title}
          emoji={look?.emoji ?? null}
          detail={CARD_WORDS.historyBill(day)}
          figure={`+${formatCents(entry.cents)}`}
        />
      );
    }
    return (
      <li key={entry.id} className='flex items-start gap-3 p-3'>
        <span
          className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
          aria-hidden='true'
        >
          <CreditCard className='h-4 w-4' />
        </span>
        <span className='block min-w-0 flex-1'>
          <span className='flex items-start justify-between gap-3'>
            <span className='font-medium'>{CARD_WORDS.historyPaid}</span>
            <span
              className={
                entry.isTakenBack
                  ? 'text-muted-foreground font-semibold tabular-nums'
                  : 'font-semibold tabular-nums'
              }
            >
              <SensitiveValue>{`−${formatCents(entry.cents)}`}</SensitiveValue>
            </span>
          </span>
          <span className='flex items-center justify-between gap-3'>
            <span className='text-muted-foreground text-sm'>{day}</span>
            {entry.isTakenBack ? (
              <span className='text-muted-foreground py-1.5 text-sm'>
                {CARD_WORDS.historyTakenBack}
              </span>
            ) : (
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                aria-label={mask(
                  CARD_WORDS.takeBackLabel(formatCents(entry.cents), day),
                )}
                disabled={takingBack !== null}
                onClick={() => void takeBack(entry)}
              >
                {CARD_WORDS.takeBack}
              </Button>
            )}
          </span>
        </span>
      </li>
    );
  };

  if (!isLoaded) {
    return (
      <p className='text-muted-foreground text-sm'>{CARD_WORDS.loading}</p>
    );
  }
  if (months.length === 0) {
    return (
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>
          {CARD_WORDS.historyEmpty}
        </p>
        {hasEarlier && (
          <p className='text-muted-foreground text-sm'>
            {CARD_WORDS.historyOlder}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className='space-y-4'>
      {months.map((month) => (
        <section key={month.label} className='space-y-2'>
          <SectionDivider label={month.label} />
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {month.rows.map(renderRow)}
          </ul>
        </section>
      ))}
      {hasEarlier && (
        <p className='text-muted-foreground text-sm'>
          {CARD_WORDS.historyOlder}
        </p>
      )}
    </div>
  );
}

export default CardHistoryView;
