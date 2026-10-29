import { collectStarted } from '@apps/runway/engine/progress';
import { useState } from 'react';
import { CreditCard, Undo2 } from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import SectionDivider from '@/components/SectionDivider';
import SensitiveValue from '@/components/SensitiveValue';
import { useAuth } from '@/hooks/useAuth';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import SheetHead from '@apps/runway/components/SheetHead';
import { CARD_WORDS } from '@apps/runway/constants';
import { collectCardHistory, withOwedAfter } from '@apps/runway/engine/cards';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { undoCardPayment } from '@apps/runway/store/actions/cardActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectRecentFrom } from '@apps/runway/store/selectors/historySelectors';
import {
  selectIsMovesLoaded,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeCardTakenBack } from '@apps/runway/utils/cardText';
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

type Entry = ReturnType<typeof withOwedAfter>[number];
type Payment = Extract<Entry, { kind: 'payment' }>;

const PAID_WORDS = {
  full: CARD_WORDS.historyPaidFull,
  minimum: CARD_WORDS.historyPaidMinimum,
  part: CARD_WORDS.historyPaidPart,
} as const;

/** What one card was charged and paid since tracking began, newest first by month; a charge opens its purchase and a payment opens a sheet where it can be taken back. */
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
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null);

  const balances = useAppSelector(selectBalances);
  const entries = withOwedAfter(
    collectCardHistory(cardId, purchases, moves),
    balances.reserveByCard[cardId] ?? 0,
  ).filter((entry) => entry.on >= startDate);
  const months = entries.reduce<{ label: string; rows: Entry[] }[]>(
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
  const owedAtStart =
    collectStarted(moves, startDate || null).byItem[cardId] ?? 0;
  const oldest = entries.at(-1);
  const getEffect = (entry: Entry) => {
    if (entry.kind !== 'payment') return entry.cents;
    return entry.isTakenBack ? 0 : -entry.cents;
  };
  const owedBeforeOldest =
    oldest === undefined
      ? (balances.reserveByCard[cardId] ?? 0)
      : oldest.owedAfterCents - getEffect(oldest);
  const startRow = owedAtStart > 0 && owedAtStart === owedBeforeOldest && (
    <section className='space-y-2'>
      <SectionDivider label={formatDateShortUTC(startDate)} />
      <ul className='border-border bg-card rounded-2xl border'>
        <li className='flex items-start justify-between gap-3 p-3 text-sm'>
          <span className='min-w-0 font-medium'>{CARD_WORDS.historyStart}</span>
          <SensitiveValue className='font-medium whitespace-nowrap tabular-nums'>
            {formatCents(owedAtStart)}
          </SensitiveValue>
        </li>
      </ul>
    </section>
  );
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
        covers: payment.covers,
        summary: describeCardTakenBack(cardName, payment.cents, payment.on),
      });
      addToast({ title: CARD_WORDS.undone(cardName), type: 'success' });
      setOpenPaymentId(null);
    } catch (error) {
      addToast({
        title: CARD_WORDS.undoFailed,
        description: getErrorMessage(error, CARD_WORDS.failed),
        type: 'error',
      });
    }
    setTakingBack(null);
  };

  const renderRow = (entry: Entry) => {
    const owes = CARD_WORDS.historyOwes(formatCents(entry.owedAfterCents));
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
          detail={
            entry.cents < 0
              ? CARD_WORDS.historyRefunded(day)
              : CARD_WORDS.historyCharged(day)
          }
          figure={formatCents(Math.abs(entry.cents))}
          figureWord={owes}
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
          figure={formatCents(entry.cents)}
          figureWord={owes}
        />
      );
    }
    return (
      <ItemRow
        key={entry.id}
        name={PAID_WORDS[entry.covers]}
        leading={
          <span
            className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
            aria-hidden='true'
          >
            <CreditCard className='h-4 w-4' />
          </span>
        }
        detail={
          entry.isTakenBack ? `${day} · ${CARD_WORDS.historyTakenBack}` : day
        }
        figure={formatCents(entry.cents)}
        figureWord={owes}
        ariaLabel={`${PAID_WORDS[entry.covers]}, ${day}. Open`}
        onOpen={
          entry.isTakenBack ? undefined : () => setOpenPaymentId(entry.id)
        }
      />
    );
  };

  const openPayment = entries.find(
    (entry): entry is Payment =>
      entry.kind === 'payment' &&
      entry.id === openPaymentId &&
      !entry.isTakenBack,
  );

  if (!isLoaded) {
    return (
      <p className='text-muted-foreground text-sm'>{CARD_WORDS.loading}</p>
    );
  }
  if (months.length === 0 && !startRow) {
    return (
      <p className='text-muted-foreground text-sm'>
        {hasEarlier ? CARD_WORDS.historyOlder : CARD_WORDS.historyEmpty}
      </p>
    );
  }
  return (
    <div className='space-y-4'>
      {openPayment && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          onClose={() => setOpenPaymentId(null)}
          title={CARD_WORDS.paymentTitle}
          actions={<ValuesEyeButton />}
        >
          <div className='space-y-4'>
            <SheetHead
              label={PAID_WORDS[openPayment.covers]}
              figure={formatCents(openPayment.cents)}
              fact={formatDateShortUTC(openPayment.on)}
            />
            <ActionGroup>
              <ActionRow
                isGrouped
                isDestructive
                icon={<Undo2 />}
                label={CARD_WORDS.takeBackAction}
                isDisabled={takingBack !== null}
                onClick={() => void takeBack(openPayment)}
              />
            </ActionGroup>
          </div>
        </FormSheet>
      )}
      {months.map((month) => (
        <section key={month.label} className='space-y-2'>
          <SectionDivider label={month.label} />
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {month.rows.map(renderRow)}
          </ul>
        </section>
      ))}
      {!hasEarlier && startRow}
      {hasEarlier && (
        <p className='text-muted-foreground text-sm'>
          {CARD_WORDS.historyOlder}
        </p>
      )}
    </div>
  );
}

export default CardHistoryView;
