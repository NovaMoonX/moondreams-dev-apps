import { Fragment, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SensitiveValue from '@/components/SensitiveValue';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import {
  formatDateOrdinalUTC,
  formatRelativeDayUTC,
} from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import AutoAmountSheet from '@apps/runway/components/AutoAmountSheet';
import { ChargePickerSheet } from '@apps/runway/components/ChargePickerView';
import ItemRow from '@apps/runway/components/ItemRow';
import PaidAmountSheet from '@apps/runway/components/PaidAmountSheet';
import {
  toBillAmountPayment,
  useBillCardName,
} from '@apps/runway/hooks/paidAmountPayment';
import {
  AUTO_PAY_WORDS,
  CARD_WORDS,
  DUE_WORDS,
  HORIZON_WORDS,
  ITEM_SHEET_R2_WORDS,
  PAID_HISTORY_WORDS,
  PURCHASE_COST_WORDS,
} from '@apps/runway/constants';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import type { BillPayment } from '@apps/runway/engine/demands';
import type { Cents } from '@apps/runway/types';
import type { CostPayment } from '@apps/runway/engine/horizon';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import type { AutoCheck } from '@apps/runway/engine/autoPay';
import { useAutoChecks } from '@apps/runway/hooks/useAutoPay';
import { useCostPaid } from '@apps/runway/hooks/useCostPaid';
import { useDueCostRows } from '@apps/runway/hooks/useDueCostRows';
import HorizonSheet from '@apps/runway/screens/plan/HorizonSheet';
import type { HorizonCost } from '@apps/runway/types';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { undoPaymentPaid, useBillPaid } from '@apps/runway/hooks/useBillPaid';
import type { WrittenPaidMark } from '@apps/runway/store/actions/moveActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectBillPayments,
  selectBills,
  selectHorizonItems,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getBillCardName } from '@apps/runway/utils/cardText';
import { describeDueDay } from '@apps/runway/utils/billText';
import { isTrackingLevel } from '@apps/runway/engine/level';
import { UNDO_WINDOW_MS } from '@/lib/undo';

type DueBill = Lookahead['due'][number];
type DueCost = Lookahead['dueCosts'][number];

type DueRow =
  | { kind: 'bill'; entry: DueBill }
  | {
      kind: 'cost';
      entry: DueCost;
      cost: HorizonCost;
      payment: CostPayment;
      emoji: string | null;
    };

interface DueBillRowProps {
  due: DueBill;
  payment: BillPayment | null;
  emoji: string | null;
  today: number;
  onOpen: () => void;
}

const getDueLine = (
  due: Pick<DueBill, 'isOverdue' | 'dueOn' | 'laterDueOn'>,
  today: number,
) => {
  if (!due.isOverdue && due.dueOn > today) {
    return DUE_WORDS.dueLater(describeDueDay(null, due.dueOn, today));
  }
  if (!due.isOverdue) return DUE_WORDS.today;
  const when = formatRelativeDayUTC(due.dueOn, today, formatDateOrdinalUTC);
  if (due.laterDueOn.length === 0) return DUE_WORDS.wasDue(when);
  return DUE_WORDS.missed(
    when,
    due.laterDueOn.filter((on) => on !== today).map(formatDateOrdinalUTC),
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
  const name = due.name === '' ? AUTO_PAY_WORDS.fallbackBillName : due.name;
  const isUndoing = useRef(false);
  const maskText = useMaskedText();
  const [isAsking, setIsAsking] = useState(false);
  const sheetCardName = useBillCardName(due.billId, payment?.dueOn ?? null);

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

  /** Resolves true once the mark is written or was already there. */
  const markPaid = async (amountCents?: Cents) => {
    if (!paid.isReady || paid.isBusy) return false;
    if (amountCents === undefined && paid.needsAmount) {
      setIsAsking(true);
      return false;
    }
    const result = await paid.markWritten(amountCents);
    if (result === null) return false;
    const { mark: written } = result;
    if (written === null) {
      addToast({ title: DUE_WORDS.alreadyPaid(name), type: 'info' });
      return true;
    }
    const state = store.getState();
    const cardName = isTrackingLevel(selectLevel(state))
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
      formatDateOrdinalUTC(due.dueOn),
      laterDates.map(formatDateOrdinalUTC),
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
      duration: UNDO_WINDOW_MS,
      action: {
        label: ITEM_SHEET_R2_WORDS.undo,
        onClick: () => void undo(written),
      },
    });
    return true;
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
      {isAsking && payment && (
        <PaidAmountSheet
          payment={toBillAmountPayment(due.name, payment, sheetCardName)}
          onMark={markPaid}
          onClose={() => setIsAsking(false)}
        />
      )}
    </li>
  );
}

interface DueCostRowProps {
  due: DueCost;
  cost: HorizonCost;
  payment: CostPayment;
  emoji: string | null;
  today: number;
}

/** One cost to pay, named with its event ("Movers · Moving"): the amount, and a quick Mark paid with an Undo toast. Opening it opens the event. */
function DueCostRow({ due, cost, payment, emoji, today }: DueCostRowProps) {
  const horizons = useAppSelector((state) => selectHorizonItems(state, today));
  const stance = useAppSelector(selectStance);
  const [isOpen, setIsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isAddingPurchase, setIsAddingPurchase] = useState(false);
  const isTrack = useAppSelector((state) =>
    isTrackingLevel(selectLevel(state)),
  );
  const name = HORIZON_WORDS.costLineName(due.costName, due.itemName);
  const paid = useCostPaid({
    itemId: due.itemId,
    itemName: due.itemName,
    cost,
    payment,
  });
  const horizon =
    horizons.find(({ item }) => item.id === due.itemId)?.version.payload ??
    null;
  const amountPayment = isAsking ? paid.toAmountPayment() : null;

  return (
    <li className='flex items-center first:[&>button]:rounded-t-2xl last:[&>button]:rounded-b-2xl'>
      <Button
        type='button'
        variant='tertiary'
        className='text-foreground! h-auto min-h-16 min-w-0 flex-1 items-center justify-start gap-3 rounded-none p-3! text-left font-normal whitespace-normal'
        aria-label={DUE_WORDS.openBills(name)}
        onClick={() => setIsOpen(true)}
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
        <span className='font-semibold whitespace-nowrap tabular-nums'>
          <SensitiveValue>
            {paid.needsAmount
              ? DUE_WORDS.upTo(formatCents(payment.totalCents))
              : formatCents(payment.totalCents)}
          </SensitiveValue>
        </span>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className="relative before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
          aria-label={
            isTrack
              ? PURCHASE_COST_WORDS.addAria(name)
              : `${DUE_WORDS.markPaid}: ${name}`
          }
          loading={paid.isBusy}
          disabled={!paid.isReady || paid.isBusy}
          onClick={() => {
            if (isTrack) setIsAddingPurchase(true);
            else if (paid.needsAmount) setIsAsking(true);
            else void paid.mark();
          }}
        >
          {isTrack ? PURCHASE_COST_WORDS.addRow : DUE_WORDS.markPaid}
        </Button>
      </span>
      {amountPayment && (
        <PaidAmountSheet
          payment={amountPayment}
          onMark={paid.mark}
          onClose={() => setIsAsking(false)}
        />
      )}
      {isAddingPurchase && (
        <PurchaseForm
          isOpen
          presetCost={{
            itemId: due.itemId,
            costId: due.costId,
            dueOn: due.dueOn,
          }}
          onClose={() => setIsAddingPurchase(false)}
        />
      )}
      {isOpen && horizon && (
        <HorizonSheet
          itemId={due.itemId}
          horizon={horizon}
          today={today}
          stance={stance}
          openCostId={isTrack ? due.costId : null}
          onClose={() => setIsOpen(false)}
        />
      )}
    </li>
  );
}

interface AutoCheckRowProps {
  check: AutoCheck;
  emoji: string | null;
}

/** A payment the app marked or could not place by itself: it opens the question it needs answered. */
function AutoCheckRow({ check, emoji }: AutoCheckRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const name =
    check.billName === '' ? AUTO_PAY_WORDS.fallbackBillName : check.billName;

  return (
    <>
      <ItemRow
        name={name}
        emoji={emoji}
        detail={
          check.kind === 'amount'
            ? AUTO_PAY_WORDS.chargedOn(formatDateOrdinalUTC(check.dueOn))
            : AUTO_PAY_WORDS.whichChargeSub(formatDateOrdinalUTC(check.dueOn))
        }
        ariaLabel={`${name}. ${
          check.kind === 'amount'
            ? AUTO_PAY_WORDS.enterAmount
            : AUTO_PAY_WORDS.whichCharge
        }`}
        onOpen={() => setIsOpen(true)}
      />
      {isOpen &&
        (check.kind === 'amount' ? (
          <AutoAmountSheet
            billId={check.billId}
            billName={name}
            dueOn={check.dueOn}
            onClose={() => setIsOpen(false)}
          />
        ) : (
          <ChargePickerSheet
            billId={check.billId}
            billName={name}
            dueOn={check.dueOn}
            onClose={() => setIsOpen(false)}
          />
        ))}
    </>
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
  const {
    showPlanSection,
    showTab,
    showOnPlan,
    openAllDue,
    closeAllDue,
    isAllDueOpen,
  } = useRunwayUrlState();
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const bills = useAppSelector((state) => selectBills(state, today));
  const emojiOf = useLiveEmojiResolver();
  const costRows = useDueCostRows(lookahead, today);
  const { checks } = useAutoChecks();
  const due: DueRow[] = [
    ...(lookahead?.due ?? []).map((entry) => ({
      kind: 'bill' as const,
      entry,
    })),
    ...costRows.map((row) => ({ kind: 'cost' as const, ...row })),
  ].sort((a, b) => (costRows.length === 0 ? 0 : a.entry.dueOn - b.entry.dueOn));
  if (due.length + checks.length === 0) return null;

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
  const rows: (DueRow | { kind: 'check'; check: AutoCheck })[] = [
    ...due,
    ...checks.map((check) => ({ kind: 'check' as const, check })),
  ];
  const hidden = rows.slice(SHOWN_DUE);
  const isUnfolded = overflow === 'unfold' && isAllDueOpen;
  const isFolded =
    overflow === 'door'
      ? hidden.length > 0
      : hidden.length > SHOWN_DUE && !isUnfolded;
  const hasFold = overflow === 'unfold' && hidden.length > SHOWN_DUE;
  const shown = isFolded ? rows.slice(0, SHOWN_DUE) : rows;
  const isAnyLate = due.some(({ entry }) => entry.isOverdue);
  const getTitle = () => {
    if (due.length === 0) return AUTO_PAY_WORDS.checksHeading;
    return isAnyLate ? DUE_WORDS.titleLate : DUE_WORDS.title;
  };
  const title = getTitle();
  const count =
    due.length > 1
      ? DUE_WORDS.count(due.length, isAnyLate, costRows.length > 0)
      : null;
  const firstCheckAt =
    due.length > 0 ? shown.findIndex((row) => row.kind === 'check') : -1;
  const toggleUnfolded = () => (isUnfolded ? closeAllDue() : openAllDue());
  const getRowKey = (row: (typeof rows)[number]) => {
    if (row.kind === 'check')
      return `${row.check.kind}-${row.check.billId}-${row.check.dueOn}`;
    if (row.kind === 'cost') return `${row.entry.itemId}-${row.entry.costId}`;
    return row.entry.billId;
  };
  const renderRow = (row: (typeof rows)[number]) => {
    if (row.kind === 'check') {
      const payload =
        bills.find(({ item }) => item.id === row.check.billId)?.version
          .payload ?? null;
      return (
        <AutoCheckRow
          check={row.check}
          emoji={payload ? emojiOf(payload.emoji, payload.groupId) : null}
        />
      );
    }
    if (row.kind === 'cost') {
      return (
        <DueCostRow
          due={row.entry}
          cost={row.cost}
          payment={row.payment}
          emoji={emojiOf(row.emoji, null)}
          today={today}
        />
      );
    }
    const { entry } = row;
    const payload =
      bills.find(({ item }) => item.id === entry.billId)?.version.payload ??
      null;
    return (
      <DueBillRow
        due={entry}
        payment={paymentOf(entry)}
        emoji={payload ? emojiOf(payload.emoji, payload.groupId) : null}
        today={today}
        onOpen={() =>
          onOpenBill
            ? onOpenBill(entry.billId)
            : void showOnPlan('bills', { itemId: entry.billId })
        }
      />
    );
  };

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
        {shown.map((row, index) => (
          <Fragment key={getRowKey(row)}>
            {index === firstCheckAt && (
              <li className='px-3 py-2'>
                <SectionDivider label={AUTO_PAY_WORDS.checksHeading} />
              </li>
            )}
            {renderRow(row)}
          </Fragment>
        ))}
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
