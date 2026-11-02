import { useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SectionHeader from '@/components/SectionHeader';
import SensitiveValue from '@/components/SensitiveValue';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { formatDateShortUTC, formatRelativeDayUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import {
  CARD_WORDS,
  DUE_WORDS,
  ITEM_SHEET_R2_WORDS,
  PAID_HISTORY_WORDS,
} from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { undoPaymentPaid, useBillPaid } from '@apps/runway/hooks/useBillPaid';
import type { WrittenPaidMark } from '@apps/runway/store/actions/moveActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectBillPayments,
  selectBills,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getBillCardName } from '@apps/runway/utils/cardText';

type DueBill = Lookahead['due'][number];

interface DueBillRowProps {
  due: DueBill;
  payment: BillPayment | null;
  emoji: string | null;
  today: number;
  onOpen: () => void;
}

const getDueLine = (due: DueBill, today: number) => {
  if (!due.isOverdue) return DUE_WORDS.today;
  const when = formatRelativeDayUTC(due.dueOn, today);
  if (due.laterDueOn.length === 0) return DUE_WORDS.wasDue(when);
  return DUE_WORDS.missed(
    when,
    due.laterDueOn.filter((on) => on !== today).map(formatDateShortUTC),
    due.laterDueOn.includes(today),
  );
};

/** One bill to pay: its name and when it fell due, the amount, and a quick Mark paid with an Undo toast. */
function DueBillRow({ due, payment, emoji, today, onOpen }: DueBillRowProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const paid = useBillPaid({
    billId: due.billId,
    billName: due.name,
    payment,
    isQuick: true,
  });
  const name = due.name === '' ? 'A bill' : due.name;
  const isUndoing = useRef(false);
  const maskText = useMaskedText();

  const undo = async (written: WrittenPaidMark) => {
    if (!user || isUndoing.current) return;
    if (!navigator.onLine) {
      addToast({ title: DUE_WORDS.undoOffline(name), type: 'error' });
      return;
    }
    isUndoing.current = true;
    try {
      const isWritten = await undoPaymentPaid(
        user.uid,
        due.billId,
        name,
        written,
      );
      addToast({
        title: isWritten
          ? ITEM_SHEET_R2_WORDS.unmarkedPaid(name)
          : PAID_HISTORY_WORDS.alreadyTakenBack(name),
        type: isWritten ? 'success' : 'info',
      });
    } catch {
      addToast({ title: DUE_WORDS.undoFailed(name), type: 'error' });
    } finally {
      isUndoing.current = false;
    }
  };

  const markPaid = async () => {
    if (!paid.isReady || paid.isBusy) return;
    const result = await paid.markWritten();
    if (result === null) return;
    const { mark: written } = result;
    if (written === null) {
      addToast({ title: DUE_WORDS.alreadyPaid(name), type: 'info' });
      return;
    }
    const state = store.getState();
    const cardName =
      selectLevel(state) === 'track'
        ? getBillCardName(
            state.runway.versions,
            state.runway.cards,
            due.billId,
            due.dueOn,
          )
        : null;
    const laterDates = due.laterDueOn.filter((on) => on !== today);
    const isDueAgainToday = due.laterDueOn.includes(today);
    const missedTitle = DUE_WORDS.paidMissed(
      name,
      formatDateShortUTC(due.dueOn),
      laterDates.map(formatDateShortUTC),
      isDueAgainToday,
    );
    addToast({
      title:
        due.laterDueOn.length > 0
          ? missedTitle
          : cardName === null
            ? ITEM_SHEET_R2_WORDS.markedPaid(name)
            : CARD_WORDS.markedPaidWith(name, cardName),
      description:
        cardName !== null && due.laterDueOn.length > 0
          ? CARD_WORDS.markedAllWith(cardName)
          : cardName === null && written.fromFreeCents > 0
            ? maskText(
                ITEM_SHEET_R2_WORDS.paidFromFreeText(
                  formatCents(written.fromFreeCents),
                ),
              )
            : undefined,
      type: 'success',
      action: {
        label: ITEM_SHEET_R2_WORDS.undo,
        onClick: () => void undo(written),
      },
    });
  };

  return (
    <li className='flex items-center first:[&>button]:rounded-t-2xl last:[&>button]:rounded-b-2xl'>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-16 min-w-0 flex-1 items-center justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
        aria-label={DUE_WORDS.openBills(name)}
        onClick={onOpen}
      >
        <ItemBadge name={name} emoji={emoji} />
        <span className='block min-w-0 flex-1'>
          <span className='line-clamp-2 font-medium break-words'>{name}</span>
          <span
            className={join(
              'block text-sm break-words',
              due.isOverdue
                ? 'text-(--runway-warning-ink)'
                : 'text-muted-foreground',
            )}
          >
            {getDueLine(due, today)}
          </span>
        </span>
      </Button>
      <span className='flex shrink-0 flex-col items-end gap-1 py-2 pr-3'>
        {payment && (
          <span className='font-semibold whitespace-nowrap tabular-nums'>
            <SensitiveValue>{formatCents(payment.totalCents)}</SensitiveValue>
          </span>
        )}
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className="relative before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
          aria-label={`${DUE_WORDS.markPaid}: ${name}`}
          loading={paid.isBusy}
          disabled={!paid.isReady || paid.isBusy}
          onClick={() => void markPaid()}
        >
          {DUE_WORDS.markPaid}
        </Button>
      </span>
    </li>
  );
}

/** Rows a crowded card shows before it folds the rest away. */
const SHOWN_DUE = 3;

interface DueBillsCardProps {
  /** Null before the plan can look ahead; nothing is drawn then. */
  lookahead: Lookahead | null;
  today: number;
  /** Opens the bill where the screen can; the default goes to the Bills section. */
  onOpenBill?: (billId: string) => void;
  /** Past the first few rows: `door` ends the card with "See all" on a section header that opens Bills; `unfold` is the card inside Bills, under a caption-sized heading, and shows the rest in place. */
  overflow: 'door' | 'unfold';
}

/** The bills due today or already past due and not marked paid: a to-do with Mark paid on each, never a gap in the plan. */
function DueBillsCard({
  lookahead,
  today,
  onOpenBill,
  overflow,
}: DueBillsCardProps) {
  const { showPlanSection, showTab, openAllDue, closeAllDue, isAllDueOpen } =
    useRunwayUrlState();
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const emojiOf = useLiveEmojiResolver();
  const due = lookahead?.due ?? [];
  if (due.length === 0) return null;

  const openBills = () => {
    showPlanSection('bills');
    showTab('plan');
  };
  const seeAll = () => {
    openBills();
    openAllDue();
  };
  const paymentOf = (entry: DueBill) =>
    (payments[entry.billId] ?? []).find(
      (payment) => payment.dueOn === entry.dueOn,
    ) ?? null;
  const hidden = due.slice(SHOWN_DUE);
  const isUnfolded = overflow === 'unfold' && isAllDueOpen;
  const isFolded =
    overflow === 'door'
      ? hidden.length > 0
      : hidden.length > SHOWN_DUE && !isUnfolded;
  const hasFold = overflow === 'unfold' && hidden.length > SHOWN_DUE;
  const shown = isFolded ? due.slice(0, SHOWN_DUE) : due;
  const isAnyLate = due.some((entry) => entry.isOverdue);
  const title = isAnyLate ? DUE_WORDS.titleLate : DUE_WORDS.title;
  const count = due.length > 1 ? DUE_WORDS.count(due.length, isAnyLate) : null;
  const toggleUnfolded = () => (isUnfolded ? closeAllDue() : openAllDue());

  return (
    <section className='space-y-2'>
      {overflow === 'door' ? (
        <SectionHeader
          title={title}
          action={
            isFolded && (
              <ShowMoreButton isHeaderAction onClick={seeAll}>
                {DUE_WORDS.seeAll}
              </ShowMoreButton>
            )
          }
          subtitle={count ?? undefined}
        />
      ) : (
        <div className='flex min-h-7 items-center justify-between gap-3'>
          <h3 className='min-w-0 text-sm font-semibold'>
            {title}
            {count && (
              <span className='text-muted-foreground font-normal'>
                {' · '}
                {count}
              </span>
            )}
          </h3>
        </div>
      )}
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {shown.map((entry) => {
          const payload =
            bills.find(({ item }) => item.id === entry.billId)?.version
              .payload ?? null;
          return (
            <DueBillRow
              key={entry.billId}
              due={entry}
              payment={paymentOf(entry)}
              emoji={payload ? emojiOf(payload.emoji, payload.groupId) : null}
              today={today}
              onOpen={() =>
                onOpenBill ? onOpenBill(entry.billId) : openBills()
              }
            />
          );
        })}
      </ul>
      {hasFold && (
        <ShowMoreButton isOpen={isUnfolded} onClick={toggleUnfolded}>
          {isUnfolded ? DUE_WORDS.fewer : DUE_WORDS.more(hidden.length)}
        </ShowMoreButton>
      )}
    </section>
  );
}

export default DueBillsCard;
