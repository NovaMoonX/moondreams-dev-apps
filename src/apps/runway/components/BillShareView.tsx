import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'react-redux';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import EffectPreview from '@apps/runway/components/EffectPreview';
import InlineNotice from '@/components/InlineNotice';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector, type RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import {
  centsToInputValue,
  formatCents,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import {
  DRAFT_WORDS,
  MAX_PURCHASE_CENTS,
  PAY_SHARE_WORDS,
} from '@apps/runway/constants';
import {
  findPayRule,
  getBillPins,
  withFundedBy,
  type BillPin,
} from '@apps/runway/engine/billShare';
import {
  payLineIdOfDayKey,
  toDayKey,
  todayAsUtcDate,
} from '@apps/runway/engine/dates';
import {
  getVersionStretches,
  resolveCurrentOrNext,
} from '@apps/runway/engine/resolve';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  getFundedByBefore,
  revertFundedBy,
  writeFundedBy,
  type FundedByBefore,
} from '@apps/runway/store/actions/billPaidFromActions';
import {
  clearBillPins,
  PinsPartlyCleared,
  restoreBillPins,
  saveBillShare,
  type DayRef,
} from '@apps/runway/store/actions/dayActions';
import {
  previewBillShareView,
  type PreviewChange,
  type PreviewVersion,
} from '@apps/runway/store/selectors/previewSelectors';
import {
  selectAllCards,
  selectBillPayments,
  selectBillProgress,
  selectComingDays,
  selectDraftHeldByItem,
  selectResolvedPlan,
  selectSettledKey,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type {
  BillFundedBy,
  BillSealed,
  BillVersion,
  Cents,
} from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { describeChange } from '@apps/runway/utils/changeText';
import {
  describePaidFrom,
  describePayChoice,
  getOneTimePayIds,
  getPayMonthDay,
} from '@apps/runway/utils/payFrom';

interface BillShareViewProps {
  billId: string;
  dayKey: string;
  /** What this pay puts toward the bill now. */
  currentCents: Cents;
  onBack: () => void;
  onClose: () => void;
  /** Opens the bill's form at its Paid from question. */
  onOpenPaidFrom: () => void;
  /** `leftOut`: the bill comes from another pay, so this view only says so. */
  mode?: 'edit' | 'leftOut';
  /** Where the bill comes from, in words, for that statement. */
  paidFromText?: string;
}

type PayRule = Extract<BillFundedBy, { kind: 'pay' }>;

/** What taking a saved change back needs, kept from before the write. */
interface Pending {
  uid: string;
  billId: string;
  billName: string;
  day: DayRef;
  today: number;
  /** The figure this action wrote for the pay. */
  wrote: Cents;
  /** The pay's own figure before; undefined when it followed the plan. */
  before: Cents | undefined;
  /** The Paid from this action wrote and the one it replaced; null when it wrote none. */
  ruleWrote: BillFundedBy | null;
  ruleBack: FundedByBefore;
  backText: string;
  /** Per-pay figures this action cleared. */
  cleared: BillPin[];
}

type AddToast = ReturnType<typeof useToast>['addToast'];
type Store = ReturnType<typeof useStore<RootState>>;

/** Takes a saved change back in the order it was made, changing only its own fields and only while they are still what this action wrote; says what it reached when a step fails. */
async function undoPending(pending: Pending, addToast: AddToast, store: Store) {
  const { uid, billId, billName, day, before, wrote, today } = pending;
  const encryption = await getRunwayEncryption(uid);
  const tell = (title: string, error: unknown) =>
    addToast({
      title,
      description: getErrorMessage(error, ''),
      type: 'error',
    });
  if (pending.ruleWrote !== null) {
    try {
      await revertFundedBy(uid, encryption, {
        billId,
        versions: store
          .getState()
          .runway.versions.filter(
            (version): version is BillVersion => version.kind === 'bill',
          ),
        today,
        wrote: pending.ruleWrote,
        back: pending.ruleBack,
        summary: PAY_SHARE_WORDS.paidFromBack(billName, pending.backText),
      });
    } catch (error) {
      tell(PAY_SHARE_WORDS.undoFailed, error);
      return;
    }
  }
  const thisKey = toDayKey(day.payLineId, day.expectedOn);
  const otherPins = pending.cleared.filter((pin) => pin.dayKey !== thisKey);
  try {
    if (otherPins.length > 0) {
      const { skipped } = await restoreBillPins(
        uid,
        encryption,
        billId,
        billName,
        otherPins,
      );
      if (skipped.length > 0) {
        tell(
          PAY_SHARE_WORDS.pinsNotBack(billName, skipped.length),
          new Error(''),
        );
      }
    }
    const wasCleared = pending.cleared.some((pin) => pin.dayKey === thisKey);
    const expected = wasCleared ? undefined : wrote;
    if (before === expected) return;
    const date = formatDateUTC(day.expectedOn);
    await saveBillShare(
      uid,
      encryption,
      day,
      billId,
      before ?? null,
      {
        itemId: billId,
        summary:
          before === undefined
            ? PAY_SHARE_WORDS.resetSummary(billName, date)
            : PAY_SHARE_WORDS.restoreSummary(
                billName,
                formatCents(before),
                date,
              ),
        note: null,
      },
      { was: expected },
    );
  } catch (error) {
    tell(
      pending.ruleWrote === null
        ? PAY_SHARE_WORDS.undoFailed
        : PAY_SHARE_WORDS.undoPartial(billName),
      error,
    );
  }
}

interface KeepChoiceProps {
  title: string;
  body: string;
  isDisabled: boolean;
  onPick: () => void;
}

function KeepChoice({ title, body, isDisabled, onPick }: KeepChoiceProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      disabled={isDisabled}
      className='text-foreground! border-border h-auto w-full flex-col items-start justify-start gap-0.5 rounded-2xl border px-3! py-2! text-left font-normal whitespace-normal'
      onClick={onPick}
    >
      <span className='text-[15px] leading-[1.125rem] font-medium'>
        {title}
      </span>
      <span className='text-muted-foreground block text-[13px] leading-[1.125rem]'>
        <MaskedText>{body}</MaskedText>
      </span>
    </Button>
  );
}

const isSameRule = (a: BillFundedBy, b: PayRule) =>
  a.kind === 'pay' && a.payLineId === b.payLineId && a.monthDay === b.monthDay;

const SHOWN_ROWS = 3;

/** The view a bill's sheet swaps in on an income day: what this one pay puts toward the bill, its effect on the other pays and on the other items, and then whether to keep it for every pay. */
function BillShareView({
  billId,
  dayKey,
  currentCents,
  onBack,
  onClose,
  onOpenPaidFrom,
  mode = 'edit',
  paidFromText = '',
}: BillShareViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const store = useStore<RootState>();
  const today = todayAsUtcDate();
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const openDays = useAppSelector((state) => state.runway.days);
  const stance = useAppSelector(selectStance);
  const heldByItem = useAppSelector(selectDraftHeldByItem);
  const settledKey = useAppSelector(selectSettledKey);
  const billProgress = useAppSelector(selectBillProgress);
  const comingDays = useAppSelector((state) => selectComingDays(state, today));
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const allCards = useAppSelector(selectAllCards);
  const billPayments = useAppSelector((state) =>
    selectBillPayments(state, today),
  )[billId];
  const day = comingDays.find((entry) => entry.dayKey === dayKey) ?? null;
  const bill = useMemo(() => {
    const found = resolveCurrentOrNext(
      versions.filter(
        (version): version is BillVersion => version.kind === 'bill',
      ),
      billId,
      day?.on ?? today,
    );
    return found ? found.payload : null;
  }, [versions, billId, day, today]);
  const [amount, setAmount] = useState(() =>
    isHidden ? '' : centsToInputValue(currentCents),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAllShown, setIsAllShown] = useState(false);
  const [saved, setSaved] = useState<{
    pending: Pending;
    rule: PayRule | null;
    leaveOut: string;
    isPartial: boolean;
    needsMoney: Cents;
  } | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const isBusyRef = useRef(false);
  const isFinishingRef = useRef(false);
  const addToastRef = useRef(addToast);
  const cardRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    addToastRef.current = addToast;
  });
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      if (!pending || isFinishingRef.current) return;
      pendingRef.current = null;
      addToastRef.current({
        title: PAY_SHARE_WORDS.savedToast(pending.billName),
        type: 'success',
        action: {
          label: PAY_SHARE_WORDS.undo,
          onClick: () => void undoPending(pending, addToastRef.current, store),
        },
      });
    },
    [store],
  );

  const parsed = parseMoneyToCents(amount);
  const target =
    parsed !== null && parsed >= 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const settledTarget = useDeferredValue(target);
  const shown = useMemo(() => {
    if (settledTarget === null || day === null) return null;
    const change: Extract<PreviewChange, { kind: 'dayBill' }> = {
      kind: 'dayBill',
      day,
      billId,
      cents: settledTarget,
    };
    return previewBillShareView(
      {
        items,
        versions,
        openDays,
        stance,
        today,
        heldByItem,
        settledKey,
        billProgress,
      },
      change,
    );
  }, [
    settledTarget,
    day,
    billId,
    items,
    versions,
    openDays,
    stance,
    today,
    heldByItem,
    settledKey,
    billProgress,
  ]);

  const share = shown?.share ?? null;
  const changedView =
    shown !== null && shown.share.cents !== currentCents ? shown : null;
  const isChanged = changedView !== null;
  const rowCount = changedView ? changedView.rows.length : 0;
  useEffect(() => {
    if (rowCount > 0) cardRef.current?.scrollIntoView({ block: 'end' });
  }, [rowCount, settledTarget]);

  if (bill === null) return null;
  const isInWindow = (billPayments ?? []).some((payment) =>
    payment.parts.some((part) => part.day.dayKey === dayKey),
  );
  if (mode !== 'edit' || !isInWindow) {
    const from = describePaidFrom(bill.fundedBy, plan, true);
    return (
      <div className='flex flex-col gap-3'>
        <BackLink onBack={onBack} />
        <ActionTitle>
          {mode !== 'edit'
            ? PAY_SHARE_WORDS.leftOutTitle(bill.name, paidFromText)
            : PAY_SHARE_WORDS.firstOnlyTitle(bill.name)}
        </ActionTitle>
        <p className='text-muted-foreground text-sm'>
          {mode !== 'edit'
            ? PAY_SHARE_WORDS.leftOutBody
            : PAY_SHARE_WORDS.firstOnlyBody(from)}
        </p>
        {mode === 'edit' && (
          <div>
            <Button type='button' variant='secondary' onClick={onOpenPaidFrom}>
              {PAY_SHARE_WORDS.setPaidFrom}
            </Button>
          </div>
        )}
      </div>
    );
  }
  const thisPayId = payLineIdOfDayKey(dayKey);
  const oneTimePays = getOneTimePayIds(plan);
  const blocker =
    target === null
      ? PAY_SHARE_WORDS.needsAmount
      : oneTimePays.has(thisPayId)
        ? PAY_SHARE_WORDS.oneTimePay(day?.payLineName ?? '', bill.name)
        : isHidden && share !== null && target > share.maxCents
          ? PAY_SHARE_WORDS.overCapHidden(bill.name)
          : !isChanged
            ? PAY_SHARE_WORDS.unchanged
            : null;
  const billRows = changedView
    ? changedView.rows.map((row) => {
        const date = formatDateShortUTC(row.on);
        return {
          key: row.dayKey,
          name:
            row.isPinned && row.beforeCents !== row.afterCents
              ? PAY_SHARE_WORDS.pinnedRow(bill.name, date)
              : PAY_SHARE_WORDS.payRow(bill.name, date),
          text: `${formatCents(row.beforeCents)} → ${formatCents(row.afterCents)}`,
        };
      })
    : [];
  const otherRows = changedView
    ? changedView.others.map((entry) => ({
        key: `${entry.itemId}:${entry.dayKey}`,
        name: `${entry.name}, ${formatDateShortUTC(entry.on)}`,
        text: `${formatCents(entry.beforeCents)} → ${formatCents(entry.afterCents)}`,
      }))
    : [];
  const dayLeftRow =
    changedView && changedView.leftBeforeCents !== changedView.leftAfterCents
      ? {
          key: 'left',
          name: DRAFT_WORDS.dayLeft,
          text: `${formatCents(changedView.leftBeforeCents)} → ${formatCents(changedView.leftAfterCents)}`,
        }
      : null;
  const hiddenBillRows = isAllShown
    ? 0
    : Math.max(0, billRows.length - SHOWN_ROWS);
  const shownBillRows = isAllShown ? billRows : billRows.slice(0, SHOWN_ROWS);
  const shownOthers = otherRows.slice(0, SHOWN_ROWS);
  const previous = openDays.find((entry) => entry.id === dayKey)?.override
    .billCents?.[billId];

  const toastSaved = (
    pending: Pending,
    title = PAY_SHARE_WORDS.savedToast(pending.billName),
  ) => {
    pendingRef.current = null;
    addToast({
      title,
      type: 'success',
      action: {
        label: PAY_SHARE_WORDS.undo,
        onClick: () => void undoPending(pending, addToast, store),
      },
    });
  };
  const finish = (pending: Pending, title?: string) => {
    toastSaved(pending, title);
    onClose();
  };

  const run = async (work: () => Promise<void>) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setError(null);
    setIsSaving(true);
    try {
      await work();
    } catch (saveError) {
      setError(getErrorMessage(saveError, PAY_SHARE_WORDS.saveFailed));
    } finally {
      isBusyRef.current = false;
      setIsSaving(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!share || !shown || !day || !user || blocker !== null) return;
      const encryption = await getRunwayEncryption(user.uid);
      const dayRef: DayRef = {
        payLineId: day.payLineId,
        sourceId: day.sourceId,
        expectedOn: day.on,
      };
      const oneTimeIds = getOneTimePayIds(plan);
      const found = findPayRule(
        share,
        dayKey,
        (payLineId, on) => getPayMonthDay(plan, payLineId, on),
        (payLineId) => oneTimeIds.has(payLineId),
      );
      const rule = found && shown.isRuleClean(found) ? found : null;
      const pending: Pending = {
        uid: user.uid,
        billId,
        billName: bill.name,
        day: dayRef,
        today,
        wrote: share.cents,
        before: previous,
        ruleWrote: null,
        ruleBack: [],
        backText: describePaidFrom(bill.fundedBy, plan),
        cleared: [],
      };
      await saveBillShare(user.uid, encryption, dayRef, billId, share.cents, {
        itemId: billId,
        summary: PAY_SHARE_WORDS.summary(
          bill.name,
          formatCents(share.cents),
          formatDateUTC(day.on),
        ),
        note: null,
      });
      const thisPayId = payLineIdOfDayKey(dayKey);
      const thisPay: PayRule | null = oneTimeIds.has(thisPayId)
        ? null
        : {
            kind: 'pay',
            payLineId: thisPayId,
            monthDay: getPayMonthDay(plan, thisPayId, day.on),
          };
      const isLeaveOut = rule === null && share.cents === 0 && thisPay !== null;
      if (rule === null && !isLeaveOut) {
        finish(pending);
        return;
      }
      pendingRef.current = pending;
      setSaved({
        pending,
        rule,
        leaveOut: describePayChoice(rule ?? (thisPay as PayRule), plan, true),
        isPartial: false,
        needsMoney: share.totalCents,
      });
    });

  const keepForEvery = () =>
    run(async () => {
      if (!saved || !saved.rule || !user || !day) return;
      const { rule } = saved;
      const encryption = await getRunwayEncryption(user.uid);
      const liveVersions = store
        .getState()
        .runway.versions.filter(
          (version): version is BillVersion => version.kind === 'bill',
        );
      const isWriting = !isSameRule(bill.fundedBy, rule);
      const optimistic: Pending = {
        ...saved.pending,
        ruleWrote: isWriting ? rule : saved.pending.ruleWrote,
        ruleBack: isWriting
          ? getFundedByBefore(liveVersions, billId, today)
          : saved.pending.ruleBack,
      };
      pendingRef.current = optimistic;
      isFinishingRef.current = true;
      const writeRule = async (): Promise<FundedByBefore | null> => {
        if (!isWriting) return null;
        const next: BillSealed = { ...bill, fundedBy: rule };
        return writeFundedBy(user.uid, encryption, {
          billId,
          versions: liveVersions,
          today,
          next: rule,
          summary: `${bill.name}: ${describeChange(
            bill,
            next,
            getCardNamer(allCards),
            undefined,
            (picked) => describePayChoice(picked, plan, true),
          )}, from ${formatDateUTC(today)}.`,
        });
      };
      const wrote = await writeRule().catch((writeError: unknown) => {
        isFinishingRef.current = false;
        pendingRef.current = saved.pending;
        throw writeError;
      });
      const withRule: Pending =
        isWriting && wrote === null
          ? { ...optimistic, ruleWrote: null, ruleBack: [] }
          : optimistic;
      pendingRef.current = withRule;
      const thisPin: BillPin = {
        dayKey,
        payLineId: day.payLineId,
        sourceId: day.sourceId,
        expectedOn: day.on,
        cents: saved.pending.wrote,
      };
      const stored = getBillPins(store.getState().runway.days, billId, today);
      const pins = stored.some((pin) => pin.dayKey === dayKey)
        ? stored
        : [...stored, thisPin];
      const alreadyCleared = saved.pending.cleared;
      const keep = (cleared: BillPin[]) => [...alreadyCleared, ...cleared];
      try {
        const cleared = await clearBillPins(
          user.uid,
          encryption,
          billId,
          bill.name,
          pins,
        );
        finish(
          { ...withRule, cleared: keep(cleared) },
          PAY_SHARE_WORDS.ruleToast(
            bill.name,
            describePayChoice(rule, plan, true),
          ),
        );
      } catch (partial) {
        const cleared =
          partial instanceof PinsPartlyCleared ? partial.cleared : [];
        isFinishingRef.current = false;
        const reached = { ...withRule, cleared: keep(cleared) };
        pendingRef.current = null;
        setSaved({ ...saved, pending: reached, isPartial: true });
        addToast({
          title: PAY_SHARE_WORDS.keepPartial(
            bill.name,
            describePayChoice(rule, plan, true),
          ),
          type: 'error',
          action: {
            label: PAY_SHARE_WORDS.undo,
            onClick: () => void undoPending(reached, addToast, store),
          },
        });
        setError(
          `${PAY_SHARE_WORDS.keepPartial(bill.name, describePayChoice(rule, plan, true))} ${getErrorMessage(partial, '')}`.trim(),
        );
      }
    });

  const undoNow = () =>
    run(async () => {
      if (!saved) return;
      const { pending } = saved;
      pendingRef.current = null;
      await undoPending(pending, addToast, store);
      onClose();
    });

  const backToSheet = () => {
    if (saved && !saved.isPartial) toastSaved(saved.pending);
    onBack();
  };

  const getRuleChangeJson = (rule: PayRule) => {
    const live = store
      .getState()
      .runway.versions.filter(
        (version): version is BillVersion => version.kind === 'bill',
      );
    const change: PreviewChange = {
      kind: 'versions',
      versions: withFundedBy(
        getVersionStretches<BillVersion, BillSealed>(live, billId, today),
        rule,
      ).map(
        (stretch) =>
          ({
            itemId: billId,
            kind: 'bill',
            effectiveFrom: stretch.effectiveFrom,
            effectiveUntil: stretch.effectiveUntil,
            changeId: 'what-if',
            payload: stretch.payload,
          }) as PreviewVersion,
      ),
      unpin: { billId, from: today, until: null },
    };
    return JSON.stringify(change);
  };
  if (saved) {
    const { rule } = saved;
    const dayLabel = formatDateShortUTC(day?.on ?? today);
    return (
      <div className='flex flex-col gap-3'>
        <BackLink onBack={backToSheet} />
        <p className='text-muted-foreground text-sm font-medium'>
          {PAY_SHARE_WORDS.savedStatus}
        </p>
        {rule ? (
          <>
            <ActionTitle>{PAY_SHARE_WORDS.keepTitle}</ActionTitle>
            {!saved.isPartial && (
              <EffectPreview
                isCompact
                changeJson={getRuleChangeJson(rule)}
                caption={PAY_SHARE_WORDS.keepEffect}
              />
            )}
            <div className='flex flex-col gap-2'>
              {saved.isPartial ? (
                <>
                  <KeepChoice
                    title={PAY_SHARE_WORDS.tryAgain}
                    body={PAY_SHARE_WORDS.tryAgainBody}
                    isDisabled={isSaving}
                    onPick={() => void keepForEvery()}
                  />
                  <KeepChoice
                    title={PAY_SHARE_WORDS.undo}
                    body={PAY_SHARE_WORDS.undoBody}
                    isDisabled={isSaving}
                    onPick={() => void undoNow()}
                  />
                </>
              ) : (
                <>
                  <KeepChoice
                    title={PAY_SHARE_WORDS.keepYes(saved.leaveOut)}
                    body={PAY_SHARE_WORDS.keepYesBody(
                      bill.name,
                      saved.leaveOut,
                      formatCents(saved.needsMoney),
                      bill.timing.schedule.kind === 'monthly'
                        ? PAY_SHARE_WORDS.eachMonth
                        : PAY_SHARE_WORDS.eachTime,
                    )}
                    isDisabled={isSaving}
                    onPick={() => void keepForEvery()}
                  />
                  <KeepChoice
                    title={PAY_SHARE_WORDS.keepJustOnce}
                    body={PAY_SHARE_WORDS.keepJustOnceBody(
                      dayLabel,
                      bill.fundedBy.kind === 'suggested'
                        ? PAY_SHARE_WORDS.laterSpread
                        : PAY_SHARE_WORDS.laterSame,
                    )}
                    isDisabled={isSaving}
                    onPick={() => finish(saved.pending)}
                  />
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <p className='text-sm'>
              {PAY_SHARE_WORDS.withheld(saved.leaveOut, bill.name)}
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='secondary'
                onClick={() => finish(saved.pending)}
              >
                {PAY_SHARE_WORDS.done}
              </Button>
              <Button
                type='button'
                variant='secondary'
                onClick={() => {
                  toastSaved(saved.pending);
                  onOpenPaidFrom();
                }}
              >
                {PAY_SHARE_WORDS.setPaidFrom}
              </Button>
            </div>
          </>
        )}
        {error && <InlineNotice tone='warning'>{error}</InlineNotice>}
      </div>
    );
  }

  const snapToCap = () => {
    if (
      !isHidden &&
      target !== null &&
      share !== null &&
      target > share.maxCents
    ) {
      setAmount(centsToInputValue(share.maxCents));
    }
  };
  const getHint = () => {
    if (isHidden || target === null || share === null || shown === null)
      return undefined;
    if (target > share.maxCents) {
      return (
        <MaskedText>
          {PAY_SHARE_WORDS.capped(
            bill.name,
            formatCents(share.totalCents),
            share.fundedCents > 0 ? formatCents(share.fundedCents) : '',
            formatCents(share.maxCents),
          )}
        </MaskedText>
      );
    }
    return target > shown.availableCents ? (
      <MaskedText>
        {PAY_SHARE_WORDS.overPay(
          formatCents(shown.availableCents),
          formatCents(target - shown.availableCents),
        )}
      </MaskedText>
    ) : undefined;
  };
  const hasShort = changedView !== null && changedView.share.shortCents > 0;
  const shortLine = hasShort
    ? mask(
        PAY_SHARE_WORDS.short(
          bill.name,
          formatCents(changedView?.share.shortCents ?? 0),
          formatDateShortUTC(changedView?.share.dueOn ?? today),
        ),
      )
    : null;

  return (
    <div className='flex flex-1 flex-col gap-3 [&_.form-footer]:mt-auto'>
      <div className='bg-background sticky top-0 z-10 flex flex-col gap-3 pb-1'>
        <BackLink onBack={onBack} />
        <ActionTitle>{PAY_SHARE_WORDS.title(bill.name)}</ActionTitle>
        <div onBlurCapture={snapToCap}>
          <AmountHero
            label={PAY_SHARE_WORDS.amount}
            value={amount}
            onChange={setAmount}
            disabled={isSaving}
            hint={getHint()}
          />
        </div>
      </div>
      {isHidden && isChanged && (
        <ActionSection caption={PAY_SHARE_WORDS.changes}>
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            <li className='px-3 py-2 text-sm'>
              <p className='flex items-baseline justify-between gap-3'>
                <span className='min-w-0 break-words'>
                  {PAY_SHARE_WORDS.hiddenEffects}
                </span>
                <span className='font-medium whitespace-nowrap tabular-nums'>
                  <MaskedText>{formatCents(0)}</MaskedText>
                </span>
              </p>
            </li>
          </ul>
        </ActionSection>
      )}
      {!isHidden && billRows.length > 0 && (
        <ActionSection caption={PAY_SHARE_WORDS.changes}>
          <ul
            ref={cardRef}
            className='border-border divide-border bg-card scroll-mb-24 divide-y overflow-y-auto rounded-2xl border [@media(min-height:500px)]:max-h-[max(9rem,calc(92dvh-27rem))]'
          >
            {[
              ...shownBillRows,
              ...shownOthers,
              ...(dayLeftRow ? [dayLeftRow] : []),
            ].map((row) => (
              <li key={row.key} className='px-3 py-2 text-sm'>
                <p className='flex items-baseline justify-between gap-3'>
                  <span className='min-w-0 break-words'>{row.name}</span>
                  <span className='font-medium whitespace-nowrap tabular-nums'>
                    <MaskedText>{row.text}</MaskedText>
                  </span>
                </p>
              </li>
            ))}
            {(hiddenBillRows > 0 || otherRows.length > SHOWN_ROWS) && (
              <li className='px-3 py-2 text-xs'>
                {hiddenBillRows > 0 ? (
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    onClick={() => setIsAllShown(true)}
                  >
                    {PAY_SHARE_WORDS.showMore(hiddenBillRows)}
                  </Button>
                ) : (
                  <span className='text-muted-foreground'>
                    {PAY_SHARE_WORDS.andMore(otherRows.length - SHOWN_ROWS)}
                  </span>
                )}
              </li>
            )}
          </ul>
          {(otherRows.length > 0 || dayLeftRow !== null) && (
            <p className='text-muted-foreground text-xs'>
              {PAY_SHARE_WORDS.whyOthers}
            </p>
          )}
        </ActionSection>
      )}
      {hasShort &&
        (isHidden ? (
          <NeedsALookRow />
        ) : (
          <InlineNotice tone='warning'>{shortLine}</InlineNotice>
        ))}
      <ModalFooterActions
        note={error ?? blocker ?? (isHidden ? null : shortLine)}
        cancelAction={
          <Button
            type='button'
            variant='secondary'
            onClick={onBack}
            disabled={isSaving}
          >
            Cancel
          </Button>
        }
        rightActions={
          <Button
            type='button'
            className='whitespace-nowrap max-sm:px-3'
            loading={isSaving}
            disabled={isSaving || blocker !== null}
            onClick={() => void save()}
          >
            {PAY_SHARE_WORDS.save}
          </Button>
        }
      />
    </div>
  );
}

export default BillShareView;
