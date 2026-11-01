import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SectionHeader from '@/components/SectionHeader';
import SensitiveValue from '@/components/SensitiveValue';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { formatRelativeDayUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import {
  CARD_WORDS,
  DUE_WORDS,
  ITEM_SHEET_R2_WORDS,
} from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { undoPaymentPaid, useBillPaid } from '@apps/runway/hooks/useBillPaid';
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

  const undo = async () => {
    if (!user) return;
    const written = (
      selectBillPayments(store.getState(), today)[due.billId] ?? []
    ).find((entry) => entry.dueOn === due.dueOn)?.paid;
    if (!written) return;
    try {
      await undoPaymentPaid(user.uid, due.billId, written);
    } catch {
      addToast({
        title: `${name} is still marked paid`,
        description: 'Undoing needs a connection. Open the bill to try again.',
        type: 'error',
      });
    }
  };

  const markPaid = async () => {
    if (!paid.isReady || paid.isBusy) return;
    const isWritten = await paid.mark();
    if (!isWritten) return;
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
    addToast({
      title:
        cardName === null
          ? ITEM_SHEET_R2_WORDS.markedPaid(name)
          : CARD_WORDS.markedPaidWith(name, cardName),
      type: 'success',
      action: { label: ITEM_SHEET_R2_WORDS.undo, onClick: () => void undo() },
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
            {due.isOverdue
              ? DUE_WORDS.wasDue(formatRelativeDayUTC(due.dueOn, today))
              : DUE_WORDS.today}
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
          disabled={!paid.isReady}
          onClick={() => void markPaid()}
        >
          {DUE_WORDS.markPaid}
        </Button>
      </span>
    </li>
  );
}

interface DueBillsCardProps {
  /** Null before the plan can look ahead; nothing is drawn then. */
  lookahead: Lookahead | null;
  today: number;
  /** Opens the bill where the screen can; the default goes to the Bills section. */
  onOpenBill?: (billId: string) => void;
}

/** The bills due today or already past due and not marked paid: a to-do with Mark paid on each, never a gap in the plan. */
function DueBillsCard({ lookahead, today, onOpenBill }: DueBillsCardProps) {
  const { showPlanSection, showTab } = useRunwayUrlState();
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const emojiOf = useLiveEmojiResolver();
  const due = lookahead?.due ?? [];
  if (due.length === 0) return null;

  const openBills = () => {
    showPlanSection('bills');
    showTab('plan');
  };

  return (
    <section className='space-y-2'>
      <SectionHeader
        title={
          due.some((entry) => entry.isOverdue)
            ? DUE_WORDS.titleLate
            : DUE_WORDS.title
        }
      />
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {due.map((entry) => {
          const payload =
            bills.find(({ item }) => item.id === entry.billId)?.version
              .payload ?? null;
          return (
            <DueBillRow
              key={entry.billId}
              due={entry}
              payment={
                (payments[entry.billId] ?? []).find(
                  (payment) => payment.dueOn === entry.dueOn,
                ) ?? null
              }
              emoji={payload ? emojiOf(payload.emoji, payload.groupId) : null}
              today={today}
              onOpen={() =>
                onOpenBill ? onOpenBill(entry.billId) : openBills()
              }
            />
          );
        })}
      </ul>
    </section>
  );
}

export default DueBillsCard;
