import { useRef, useState } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import {
  CircleCheck,
  HandCoins,
  Lock,
  Pencil,
  Receipt,
  ReceiptText,
  Tag,
  Trash2,
  Undo2,
} from 'lucide-react';

import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import AmountField from '@/components/AmountField';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import RevealChip from '@/components/RevealChip';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import ChoiceCards from '@apps/runway/components/ChoiceCards';
import HorizonChangeView from '@apps/runway/components/HorizonChangeView';
import { MaskedText } from '@apps/runway/components/MaskedText';
import PaidAmountSheet from '@apps/runway/components/PaidAmountSheet';
import RangeNote from '@apps/runway/components/RangeNote';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  COST_PAID_WORDS,
  FORM_FLOW_WORDS,
  HORIZON_PRICE_REASON_CHIPS,
  HORIZON_WORDS,
  MAKE_BILL_WORDS,
  PAY_SHARE_WORDS,
  PURCHASE_COST_WORDS,
} from '@apps/runway/constants';
import { DAY_MS } from '@apps/runway/engine/dates';
import {
  getCostShare,
  getLiveCosts,
  getMakeBillBlock,
  getPurchaseMarkFigures,
  hasOtherOpenCost,
  removeCost,
  restoreCost,
  setCostPrice,
  settleCostPaid,
  type CostPaidEntry,
} from '@apps/runway/engine/horizon';
import BillForm from '@apps/runway/forms/BillForm';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import { useCostPaid } from '@apps/runway/hooks/useCostPaid';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectCostPaid,
  selectCostPayments,
  selectHorizonItems,
  selectSpendPurchases,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { HorizonCost, HorizonSealed, Stance } from '@apps/runway/types';
import { describeCostGivesBack } from '@apps/runway/utils/changeText';
import {
  describeCost,
  describeCostInSentence,
  describeCostTiming,
} from '@apps/runway/utils/horizonText';
import {
  EMPTY_AMOUNT_DRAFT,
  getAmountDraftProblem,
  parseAmountDraft,
  toAmountDraft,
  type AmountDraft,
} from '@apps/runway/utils/rangeInput';
import { formatRange } from '@apps/runway/utils/rangeText';

type PriceWay = 'exact' | 'range';

const PRICE_WAYS = [
  {
    value: 'exact' as const,
    title: HORIZON_WORDS.priceExactTitle,
    body: HORIZON_WORDS.priceExactBody,
  },
  {
    value: 'range' as const,
    title: HORIZON_WORDS.priceRangeTitle,
    body: HORIZON_WORDS.priceRangeBody,
  },
];

interface PriceViewProps {
  itemId: string;
  horizon: HorizonSealed;
  cost: HorizonCost;
  today: number;
  onBack: () => void;
}

/** Say what the cost really is: an exact amount or a range, from today. The way is asked first, with nothing chosen for the person. */
function PriceView({ itemId, horizon, cost, today, onBack }: PriceViewProps) {
  const [way, setWay] = useState<PriceWay | null>(null);
  const [draft, setDraft] = useState<AmountDraft>(EMPTY_AMOUNT_DRAFT);
  const range = way === null ? null : parseAmountDraft(draft);
  const isSame =
    range !== null &&
    range.lowCents === cost.amount.lowCents &&
    range.highCents === cost.amount.highCents;
  const getBlocker = () => {
    if (way === null) return HORIZON_WORDS.pickPriceWay;
    if (range === null) {
      return getAmountDraftProblem(draft) ?? FORM_FLOW_WORDS.badAmount;
    }
    return isSame ? HORIZON_WORDS.samePrice : null;
  };
  const pickWay = (next: PriceWay) => {
    setWay(next);
    setDraft(
      next === 'exact'
        ? EMPTY_AMOUNT_DRAFT
        : { ...toAmountDraft(cost.amount, null), mode: 'range' },
    );
  };

  return (
    <HorizonChangeView
      itemId={itemId}
      backLabel={cost.name}
      title={HORIZON_WORDS.setPriceTitle(cost.name)}
      current={horizon}
      candidate={
        range === null || isSame
          ? null
          : setCostPrice(horizon, cost.id, range, today)
      }
      blocker={getBlocker()}
      reasonChips={HORIZON_PRICE_REASON_CHIPS}
      saveLabel={HORIZON_WORDS.setPriceSave}
      onBack={onBack}
      onDone={onBack}
    >
      <ChoiceCards options={PRICE_WAYS} value={way} onChange={pickWay} />
      {way !== null && (
        <AmountField
          key={way}
          isHero
          autoFocus
          label={HORIZON_WORDS.costAmount}
          mode={draft.mode}
          value={draft.low}
          onChange={(low) => setDraft({ ...draft, low })}
          highValue={draft.high}
          onHighChange={(high) => setDraft({ ...draft, high })}
          hint={
            way === 'exact' && (
              <MaskedText>
                {HORIZON_WORDS.priceHint(formatRange(cost.amount))}
              </MaskedText>
            )
          }
        />
      )}
    </HorizonChangeView>
  );
}

interface CostSheetProps {
  itemId: string;
  horizon: HorizonSealed;
  cost: HorizonCost;
  today: number;
  stance: Stance;
  /** Back to the event's sheet, or to the record it was opened from. */
  onBack: () => void;
  /** The record the sheet was opened from, when that isn't the event. */
  backLabel?: string | null;
  /** Opens the cost's Change form, which replaces the event's sheet. */
  onChange: () => void;
}

/** One cost of an event, swapped into the event's sheet: set its price, change it, or remove it. */
function CostSheet({
  itemId,
  horizon,
  cost,
  today,
  stance,
  onBack,
  backLabel = null,
  onChange,
}: CostSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const mask = useMaskedText();
  const { isHidden } = useValuesHidden();
  const [view, setView] = useState<'menu' | 'price'>('menu');
  const [isRemoving, setIsRemoving] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [takingBackId, setTakingBackId] = useState<string | null>(null);
  const [isAddingPurchase, setIsAddingPurchase] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMakingBill, setIsMakingBill] = useState(false);
  const { showOnPlan } = useRunwayUrlState();
  const isTrack = useAppSelector(selectLevel) === 'track';
  const isRestoring = useRef(false);
  const payments = useAppSelector((state) => selectCostPayments(state, today))[
    itemId
  ];
  const heldCents = useAppSelector(
    (state) => selectBalances(state).assignedByItem[itemId] ?? 0,
  );
  const costPayments = (payments ?? []).filter(
    ({ costId }) => costId === cost.id,
  );
  const next = costPayments.find(({ paid }) => paid === null) ?? null;
  const purchases = useAppSelector(selectSpendPurchases);
  const itemFromFreeCents = useAppSelector(
    (state) => selectBalances(state).costFromFreeByItem[itemId] ?? 0,
  );
  const paidEntries = costPayments.flatMap(({ paid }) =>
    paid
      ? [
          paid.mark === 'purchase'
            ? getPurchaseMarkFigures(
                paid,
                purchases.find(({ id }) => id === paid.purchaseId) ?? null,
                itemFromFreeCents,
              )
            : paid,
        ]
      : [],
  );
  const costPaid = useCostPaid({
    itemId,
    itemName: horizon.name,
    cost,
    payment: next,
  });

  const canAddPurchase = isTrack && next !== null && !cost.isOutside;
  const isNear = next !== null && next.dueOn - 7 * DAY_MS <= today;
  const isFar = canAddPurchase && !isNear;
  const isMarkShown = !canAddPurchase || isNear || isMoreOpen;
  const isExact = cost.amount.lowCents === cost.amount.highCents;
  const isLive = cost.endsAfter === null;
  const isRepeat = cost.schedule.kind !== 'once';
  const isPaidOnce = !isRepeat && paidEntries.length > 0;
  const isBill = cost.becameBillId !== null;
  const itemPaid = useAppSelector(selectCostPaid)[itemId];
  const makeBillBlock = getMakeBillBlock(costPayments, today);
  const canMakeBill =
    isRepeat && isLive && !cost.isOutside && !isBill && next !== null;
  const hasOtherOpen = hasOtherOpenCost(
    horizon,
    cost.id,
    today,
    stance,
    itemPaid ?? [],
  );
  const shareCents = getCostShare(horizon, cost.id, heldCents, payments ?? []);
  const isRemovable =
    isLive && !isPaidOnce && !isBill && getLiveCosts(horizon).length > 1;
  const settled =
    next === null
      ? paidEntries.reduce<CostPaidEntry | null>(
          (best, entry) => (best && best.paidOn >= entry.paidOn ? best : entry),
          null,
        )
      : null;
  const when = isRepeat
    ? describeCostTiming(cost.schedule, cost.ending)
    : HORIZON_WORDS.costDue(
        formatDateOrdinalUTC(cost.schedule.anchor ?? today),
      );

  if (view === 'price') {
    return (
      <PriceView
        itemId={itemId}
        horizon={horizon}
        cost={cost}
        today={today}
        onBack={() => setView('menu')}
      />
    );
  }

  const getLive = () =>
    selectHorizonItems(store.getState(), today).find(
      ({ item }) => item.id === itemId,
    )?.version.payload ?? null;

  const write = async (payload: HorizonSealed, summary: string) => {
    if (!user) return;
    const encryption = await getRunwayEncryption(user.uid);
    await changeItem(user.uid, encryption, {
      itemId,
      kind: 'horizon',
      payload,
      summary,
      note: null,
      effectiveFrom: today,
    });
  };

  const remove = async () => {
    if (!user || isRemoving) return;
    const isConfirmed = await confirm({
      title: HORIZON_WORDS.removeConfirmTitle(cost.name),
      message: mask(
        HORIZON_WORDS.removeConfirmText(
          cost.name,
          describeCostInSentence(cost),
          horizon.name,
        ),
      ),
      confirmText: HORIZON_WORDS.removeConfirm,
      destructive: true,
    });
    if (!isConfirmed) return;
    const live = getLive();
    const index = live?.costs.findIndex(({ id }) => id === cost.id) ?? -1;
    const gone = live?.costs[index];
    const without =
      live && gone
        ? removeCost(live, cost.id, today, paidEntries.length > 0)
        : null;
    if (!without || !gone) {
      addToast({ title: HORIZON_WORDS.removeGone, type: 'error' });
      return;
    }
    const from = formatDateOrdinalUTC(today);
    const timing = describeCostInSentence(gone);
    setIsRemoving(true);
    try {
      await write(
        without,
        HORIZON_WORDS.removeSummary(without.name, gone.name, timing, from),
      );
      addToast({
        title: HORIZON_WORDS.removedToast(gone.name),
        type: 'success',
        action: {
          label: PAY_SHARE_WORDS.undo,
          onClick: () => {
            if (isRestoring.current) return;
            isRestoring.current = true;
            const now = getLive();
            const back = now ? restoreCost(now, gone, index) : null;
            if (!now || !back) {
              isRestoring.current = false;
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: HORIZON_WORDS.restoreGone,
                type: 'error',
              });
              return;
            }
            void write(
              back,
              HORIZON_WORDS.restoreSummary(now.name, gone.name, timing, from),
            ).catch((undoError: unknown) => {
              isRestoring.current = false;
              addToast({
                title: PAY_SHARE_WORDS.undoFailed,
                description: getErrorMessage(
                  undoError,
                  HORIZON_WORDS.restoreFailed,
                ),
                type: 'error',
              });
            });
          },
        },
      });
      onBack();
    } catch (removeError) {
      addToast({
        title: HORIZON_WORDS.removeFailed,
        description: getErrorMessage(removeError, ''),
        type: 'error',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const getPaidSplit = (entry: CostPaidEntry) => {
    if (entry.mark === 'outside') return COST_PAID_WORDS.outsideNote;
    const fromItem = entry.amountCents - entry.fromFreeCents;
    return [
      fromItem > 0 &&
        COST_PAID_WORDS.fromItem(horizon.name, formatCents(fromItem)),
      entry.fromFreeCents > 0 &&
        COST_PAID_WORDS.fromFree(formatCents(entry.fromFreeCents)),
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const getPaidLine = (entry: CostPaidEntry) => {
    // The head already says what it came to and when, so the row says where it came from.
    if (entry === settled) {
      return entry.mark === 'outside'
        ? COST_PAID_WORDS.nothingFromItem(horizon.name)
        : getPaidSplit(entry);
    }
    const row =
      entry.mark === 'outside'
        ? COST_PAID_WORDS.paidOutsideRow(formatDateOrdinalUTC(entry.paidOn))
        : COST_PAID_WORDS.paidRow(
            formatDateOrdinalUTC(entry.paidOn),
            formatCents(entry.amountCents),
          );
    return isRepeat
      ? `${row}\u00A0· ${PURCHASE_COST_WORDS.paidFor(formatDateOrdinalUTC(entry.dueOn))}`
      : row;
  };

  const getBoughtLine = (entry: CostPaidEntry) => {
    if (entry.mark !== 'purchase' || !isTrack) return null;
    const bought = purchases.find(({ id }) => id === entry.purchaseId);
    const name = bought?.merchant ?? bought?.label ?? null;
    return name === null
      ? PURCHASE_COST_WORDS.aPurchase
      : PURCHASE_COST_WORDS.boughtIn(name);
  };

  const getPaidWith = (entry: CostPaidEntry) => {
    if (entry.mark !== 'purchase' || !isTrack) return null;
    const bought = purchases.find(({ id }) => id === entry.purchaseId);
    const name = bought?.merchant ?? bought?.label ?? null;
    return name === null ? null : PURCHASE_COST_WORDS.paidWith(name);
  };

  const getTakeBackSubtitle = (entry: CostPaidEntry) =>
    entry.mark === 'outside'
      ? COST_PAID_WORDS.takeBackSubOutside
      : describeCostGivesBack(
          horizon.name,
          entry.amountCents,
          entry.fromFreeCents,
          isTrack ? entry.mark : 'item',
        );

  const getMarkBody = () => {
    if (cost.isOutside) return COST_PAID_WORDS.markSubOutside(horizon.name);
    if (costPaid.needsAmount) return COST_PAID_WORDS.markSubRange;
    const total = next?.totalCents ?? 0;
    const { fromItemCents, fromFreeCents } = settleCostPaid(total, heldCents);
    // While hidden the sentence is one shape, so it never tells whether Free to Spend is drawn on.
    if (isHidden) {
      return COST_PAID_WORDS.markSubFree(
        formatCents(fromItemCents),
        horizon.name,
        formatCents(fromFreeCents),
      );
    }
    if (fromFreeCents === 0) {
      return COST_PAID_WORDS.markSub(formatCents(total), horizon.name);
    }
    return fromItemCents === 0
      ? COST_PAID_WORDS.markSubNothingLeft(
          formatCents(fromFreeCents),
          horizon.name,
        )
      : COST_PAID_WORDS.markSubFree(
          formatCents(fromItemCents),
          horizon.name,
          formatCents(fromFreeCents),
        );
  };

  const dueFor =
    isRepeat && next !== null ? formatDateOrdinalUTC(next.dueOn) : null;
  const getMarkSubtitle = () => {
    const body = getMarkBody();
    const lead = [
      dueFor === null || (isTrack && !cost.isOutside)
        ? null
        : PURCHASE_COST_WORDS.forPayment(dueFor),
      isTrack && !cost.isOutside ? PURCHASE_COST_WORDS.noPurchase : null,
    ].filter(Boolean);
    return [...lead, body].join('. ');
  };

  const takeBackEntry = async (entry: CostPaidEntry) => {
    if (entry.mark === 'purchase' && isTrack) {
      const isConfirmed = await confirm({
        title: PURCHASE_COST_WORDS.takeBackTitle(cost.name),
        message: mask(
          PURCHASE_COST_WORDS.takeBackText(
            formatCents(entry.amountCents),
            formatDateOrdinalUTC(entry.paidOn),
            describeCostGivesBack(
              horizon.name,
              entry.amountCents,
              entry.fromFreeCents,
              'item',
            ),
          ),
        ),
        confirmText: COST_PAID_WORDS.takeBack,
        destructive: true,
      });
      if (!isConfirmed) return;
    }
    if (await costPaid.takeBack(entry)) setTakingBackId(null);
  };

  const takingBack = paidEntries.find(({ moveId }) => moveId === takingBackId);
  const amountPayment = isAsking ? costPaid.toAmountPayment() : null;

  const addRow = (
    <ActionRow
      isGrouped
      isRoomy
      hasChevron
      icon={<ReceiptText />}
      label={PURCHASE_COST_WORDS.addRow}
      subtitle={
        dueFor === null
          ? PURCHASE_COST_WORDS.addSub
          : `${PURCHASE_COST_WORDS.forPayment(dueFor)}. ${PURCHASE_COST_WORDS.addSub}`
      }
      isDisabled={!costPaid.isReady || costPaid.isBusy}
      onClick={() => setIsAddingPurchase(true)}
    />
  );
  const markRow = (
    <ActionRow
      isGrouped
      isRoomy
      hasChevron={costPaid.needsAmount}
      icon={<HandCoins />}
      label={
        cost.isOutside
          ? COST_PAID_WORDS.markOutsideRow(cost.name)
          : COST_PAID_WORDS.markRow
      }
      subtitle={mask(getMarkSubtitle())}
      isDisabled={!costPaid.isReady || costPaid.isBusy}
      onClick={() => {
        if (costPaid.needsAmount) setIsAsking(true);
        else void costPaid.mark();
      }}
    />
  );

  return (
    <div className='space-y-4'>
      <BackLink label={backLabel ?? horizon.name} onBack={onBack} />
      <SheetHead
        label={cost.name}
        figure={
          settled ? formatCents(settled.amountCents) : formatRange(cost.amount)
        }
        suffix={describeCost(cost).per || undefined}
        fact={
          isBill && !settled
            ? MAKE_BILL_WORDS.nowABill
            : settled
              ? COST_PAID_WORDS.paidHead(
                  formatDateOrdinalUTC(settled.paidOn),
                  settled.mark === 'outside',
                )
              : HORIZON_WORDS.costFact(
                  when,
                  cost.pricedOn === null
                    ? null
                    : formatDateOrdinalUTC(cost.pricedOn),
                  cost.isOutside,
                )
        }
      />
      {!settled && (
        <RangeNote isShort range={cost.amount} stance={stance} side='expense' />
      )}
      <ActionGroup isRoomy>
        {next && isMarkShown && !isFar && markRow}
        {paidEntries.map((entry) => (
          <ActionRow
            key={entry.moveId}
            isGrouped
            isRoomy
            hasChevron
            icon={<CircleCheck />}
            label={mask(getPaidLine(entry))}
            subtitle={getPaidWith(entry) ?? undefined}
            onClick={() => setTakingBackId(entry.moveId)}
          />
        ))}
        {!settled && !isBill && (
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Tag />}
            label={HORIZON_WORDS.setPrice}
            subtitle={
              isExact
                ? mask(
                    HORIZON_WORDS.setPriceSubExact(
                      formatCents(cost.amount.lowCents),
                    ),
                  )
                : HORIZON_WORDS.setPriceSub
            }
            onClick={() => setView('price')}
          />
        )}
        <ActionRow
          isGrouped
          isRoomy
          hasChevron
          icon={<Pencil />}
          label={HORIZON_WORDS.changeCostRow}
          subtitle={HORIZON_WORDS.changeCostSub}
          onClick={onChange}
        />
        {canMakeBill && makeBillBlock === null && (
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Receipt />}
            label={MAKE_BILL_WORDS.row}
            subtitle={MAKE_BILL_WORDS.rowSub}
            onClick={() => setIsMakingBill(true)}
          />
        )}
        {canMakeBill && makeBillBlock !== null && (
          <ActionRow
            isGrouped
            isRoomy
            icon={<Lock />}
            label={MAKE_BILL_WORDS.row}
            subtitle={
              makeBillBlock.kind === 'laterPaid'
                ? MAKE_BILL_WORDS.lockedLaterPaid(
                    formatDateOrdinalUTC(makeBillBlock.dueOn),
                  )
                : MAKE_BILL_WORDS.lockedPastDue(
                    formatDateOrdinalUTC(makeBillBlock.dueOn),
                  )
            }
            onClick={() => undefined}
          />
        )}
        {cost.becameBillId !== null && (
          <ActionRow
            isGrouped
            isRoomy
            hasChevron
            icon={<Receipt />}
            label={MAKE_BILL_WORDS.nowABill}
            subtitle={MAKE_BILL_WORDS.nowABillSub}
            onClick={() =>
              showOnPlan('bills', { itemId: cost.becameBillId ?? '' })
            }
          />
        )}
        {isFar && isMoreOpen && addRow}
        {next && isFar && isMoreOpen && markRow}
        {isRemovable && (
          <ActionRow
            isGrouped
            isRoomy
            isDestructive
            icon={<Trash2 />}
            label={HORIZON_WORDS.removeCostRow}
            subtitle={HORIZON_WORDS.removeCostSub}
            isDisabled={isRemoving}
            onClick={() => void remove()}
          />
        )}
      </ActionGroup>
      {canAddPurchase && !isNear && !isMoreOpen && (
        <div>
          <RevealChip onClick={() => setIsMoreOpen(true)}>
            {PURCHASE_COST_WORDS.moreWays}
          </RevealChip>
        </div>
      )}
      {isPaidOnce && (
        <p className='text-muted-foreground text-sm'>
          {HORIZON_WORDS.paidStaysInRecord}
        </p>
      )}
      {isLive && !isPaidOnce && !isRemovable && !isBill && (
        <p className='text-muted-foreground text-sm'>
          {HORIZON_WORDS.changeLastCost}
        </p>
      )}
      {canAddPurchase && isNear && (
        <ModalFooterActions
          rightActions={
            <Button
              type='button'
              disabled={!costPaid.isReady || costPaid.isBusy}
              onClick={() => setIsAddingPurchase(true)}
            >
              {PURCHASE_COST_WORDS.addRow}
            </Button>
          }
        />
      )}
      {isMakingBill && next && (
        <BillForm
          isOpen
          title={MAKE_BILL_WORDS.title(cost.name)}
          fromCost={{
            itemId,
            horizon,
            cost,
            firstDueOn: next.dueOn,
            shareCents,
            hasOtherOpenCost: hasOtherOpen,
          }}
          onClose={() => setIsMakingBill(false)}
        />
      )}
      {isAddingPurchase && next && (
        <PurchaseForm
          isOpen
          presetCost={{ itemId, costId: cost.id, dueOn: next.dueOn }}
          onCancel={() => setIsAddingPurchase(false)}
          onClose={() => {
            setIsAddingPurchase(false);
            onBack();
          }}
        />
      )}
      {amountPayment && (
        <PaidAmountSheet
          payment={amountPayment}
          onMark={costPaid.mark}
          onClose={() => setIsAsking(false)}
        />
      )}
      {takingBack && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          onClose={() => setTakingBackId(null)}
          title={COST_PAID_WORDS.paidSheetTitle(cost.name)}
          actions={<ValuesEyeButton />}
        >
          <div className='space-y-4 pb-4'>
            <div className='space-y-1 text-sm'>
              <p className='font-medium'>
                {COST_PAID_WORDS.paidHead(
                  formatDateOrdinalUTC(takingBack.paidOn),
                )}
              </p>
              <p className='text-muted-foreground'>
                {COST_PAID_WORDS.cameTo}{' '}
                <MaskedText>{formatCents(takingBack.amountCents)}</MaskedText>
              </p>
              <p className='text-muted-foreground'>
                <MaskedText>{getPaidSplit(takingBack)}</MaskedText>
              </p>
              {getBoughtLine(takingBack) !== null && (
                <p className='text-muted-foreground'>
                  <MaskedText>{getBoughtLine(takingBack) ?? ''}</MaskedText>
                </p>
              )}
            </div>
            <ActionGroup>
              <ActionRow
                isGrouped
                isDestructive
                icon={<Undo2 />}
                label={COST_PAID_WORDS.takeBack}
                subtitle={mask(getTakeBackSubtitle(takingBack) ?? '')}
                isDisabled={costPaid.isBusy}
                onClick={() => void takeBackEntry(takingBack)}
              />
            </ActionGroup>
          </div>
        </FormSheet>
      )}
    </div>
  );
}

export default CostSheet;
