import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'react-redux';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
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
import { payLineIdOfDayKey, todayAsUtcDate } from '@apps/runway/engine/dates';
import { findPayRule } from '@apps/runway/engine/billShare';
import {
  getVersionStretches,
  resolveCurrentOrNext,
  type VersionStretch,
} from '@apps/runway/engine/resolve';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import {
  saveBillShare,
  type DayRef,
} from '@apps/runway/store/actions/dayActions';
import {
  previewBillShareView,
  type PreviewChange,
} from '@apps/runway/store/selectors/previewSelectors';
import {
  selectAllCards,
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
}

type PayRule = Extract<BillFundedBy, { kind: 'pay' }>;

/** Everything taking a saved share back needs, kept from before the write. */
interface Pending {
  uid: string;
  billId: string;
  billName: string;
  day: DayRef;
  /** This pay's own figure before the change; undefined when it followed the plan. */
  before: Cents | undefined;
  /** The bill's stretches before a Paid from rule was written; null when none was. */
  stretches: VersionStretch<BillSealed>[] | null;
  wasText: string;
  rule: PayRule | null;
}

type AddToast = ReturnType<typeof useToast>['addToast'];

/** Takes a saved share back, in the order it was made, and says what it reached if a step fails. */
async function undoPending(pending: Pending, addToast: AddToast) {
  const { uid, billId, billName, day, before, stretches } = pending;
  const encryption = await getRunwayEncryption(uid);
  const isRuleBack = stretches === null;
  if (stretches !== null && stretches.length > 0) {
    try {
      await changeItem(uid, encryption, {
        itemId: billId,
        kind: 'bill',
        payload: stretches[0].payload,
        summary: PAY_SHARE_WORDS.paidFromBack(billName, pending.wasText),
        note: null,
        effectiveFrom: stretches[0].effectiveFrom,
        stretches,
      });
    } catch (error) {
      addToast({
        title: PAY_SHARE_WORDS.undoFailed,
        description: getErrorMessage(error, ''),
        type: 'error',
      });
      return;
    }
  }
  try {
    const date = formatDateUTC(day.expectedOn);
    await saveBillShare(uid, encryption, day, billId, before ?? null, {
      itemId: billId,
      summary:
        before === undefined
          ? PAY_SHARE_WORDS.resetSummary(billName, date)
          : PAY_SHARE_WORDS.restoreSummary(billName, formatCents(before), date),
      note: null,
    });
  } catch (error) {
    addToast({
      title: isRuleBack
        ? PAY_SHARE_WORDS.undoFailed
        : PAY_SHARE_WORDS.undoPartial(billName),
      description: getErrorMessage(error, ''),
      type: 'error',
    });
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
      className='text-foreground! border-border h-auto w-full flex-col items-start justify-start gap-0 rounded-2xl border px-3! py-1.5! text-left font-normal whitespace-normal'
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

/** The view a bill's sheet swaps in on an income day: what this one pay puts toward the bill, its effect on the other pays, and then whether to keep it for every pay. */
function BillShareView({
  billId,
  dayKey,
  currentCents,
  onBack,
  onClose,
  onOpenPaidFrom,
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
  const [saved, setSaved] = useState<(Pending & { rule: PayRule }) | null>(
    null,
  );
  const [withheld, setWithheld] = useState<{
    pending: Pending;
    leaveOut: string;
  } | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const addToastRef = useRef(addToast);

  useEffect(() => {
    addToastRef.current = addToast;
  });
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      addToastRef.current({
        title: PAY_SHARE_WORDS.savedToast(pending.billName),
        type: 'success',
        action: {
          label: PAY_SHARE_WORDS.undo,
          onClick: () => void undoPending(pending, addToastRef.current),
        },
      });
    },
    [],
  );

  const parsed = parseMoneyToCents(amount);
  const target =
    parsed !== null && parsed >= 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const shown = useMemo(() => {
    if (target === null || day === null) return null;
    const change: Extract<PreviewChange, { kind: 'dayBill' }> = {
      kind: 'dayBill',
      day,
      billId,
      cents: target,
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
    target,
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
  if (bill === null) return null;
  const isChanged = share !== null && share.cents !== currentCents;
  const blocker =
    target === null
      ? PAY_SHARE_WORDS.needsAmount
      : !isChanged
        ? PAY_SHARE_WORDS.unchanged
        : null;
  const rows = isChanged
    ? share.rows.map((row) => {
        const date = formatDateShortUTC(row.on);
        return {
          key: row.dayKey,
          name:
            row.isPinned && row.beforeCents !== row.afterCents
              ? PAY_SHARE_WORDS.pinnedRow(date)
              : PAY_SHARE_WORDS.payRow(date),
          text: `${formatCents(row.beforeCents)} → ${formatCents(row.afterCents)}`,
        };
      })
    : [];
  const dayLeftRow =
    isChanged && shown && shown.leftBeforeCents !== shown.leftAfterCents
      ? {
          key: 'left',
          name: DRAFT_WORDS.dayLeft,
          text: `${formatCents(shown.leftBeforeCents)} → ${formatCents(shown.leftAfterCents)}`,
        }
      : null;
  const previous = openDays.find((entry) => entry.id === dayKey)?.override
    .billCents?.[billId];

  const toastSaved = (title: string, pending: Pending) => {
    pendingRef.current = null;
    addToast({
      title,
      type: 'success',
      action: {
        label: PAY_SHARE_WORDS.undo,
        onClick: () => void undoPending(pending, addToast),
      },
    });
  };
  const finish = (title: string, pending: Pending) => {
    toastSaved(title, pending);
    onClose();
  };

  const run = async (work: () => Promise<void>) => {
    if (isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      await work();
    } catch (saveError) {
      setError(getErrorMessage(saveError, PAY_SHARE_WORDS.saveFailed));
    } finally {
      setIsSaving(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!share || !day || !user || blocker !== null) return;
      const encryption = await getRunwayEncryption(user.uid);
      const dayRef: DayRef = {
        payLineId: day.payLineId,
        sourceId: day.sourceId,
        expectedOn: day.on,
      };
      const oneTimeIds = getOneTimePayIds(plan);
      const rule = findPayRule(
        share,
        dayKey,
        (payLineId, on) => getPayMonthDay(plan, payLineId, on),
        (payLineId) => oneTimeIds.has(payLineId),
      );
      const pending: Pending = {
        uid: user.uid,
        billId,
        billName: bill.name,
        day: dayRef,
        before: previous,
        stretches: null,
        wasText: describePaidFrom(bill.fundedBy, plan),
        rule,
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
      if (rule === null) {
        const thisPay: PayRule | null = oneTimeIds.has(
          payLineIdOfDayKey(dayKey),
        )
          ? null
          : {
              kind: 'pay',
              payLineId: payLineIdOfDayKey(dayKey),
              monthDay: getPayMonthDay(plan, payLineIdOfDayKey(dayKey), day.on),
            };
        if (share.cents === 0 && thisPay !== null) {
          pendingRef.current = pending;
          setWithheld({
            pending,
            leaveOut: describePayChoice(thisPay, plan),
          });
          return;
        }
        finish(PAY_SHARE_WORDS.savedToast(bill.name), pending);
        return;
      }
      const withStretches: Pending & { rule: PayRule } = {
        ...pending,
        rule,
        stretches: getVersionStretches<BillVersion, BillSealed>(
          store
            .getState()
            .runway.versions.filter(
              (version): version is BillVersion => version.kind === 'bill',
            ),
          billId,
          today,
        ),
      };
      pendingRef.current = { ...withStretches, stretches: null };
      setSaved(withStretches);
    });

  const keepForEvery = () =>
    run(async () => {
      if (!saved || !user) return;
      const encryption = await getRunwayEncryption(user.uid);
      const payName = describePayChoice(saved.rule, plan);
      if (!isSameRule(bill.fundedBy, saved.rule)) {
        const next: BillSealed = { ...bill, fundedBy: saved.rule };
        await changeItem(user.uid, encryption, {
          itemId: billId,
          kind: 'bill',
          payload: next,
          summary: `${bill.name}: ${describeChange(bill, next, getCardNamer(allCards), undefined, (fundedBy) => describePayChoice(fundedBy, plan))}, from ${formatDateUTC(today)}.`,
          note: null,
          effectiveFrom: today,
          stretches: (saved.stretches ?? []).map((stretch) => ({
            ...stretch,
            payload: { ...stretch.payload, fundedBy: saved.rule },
          })),
        });
      }
      try {
        await saveBillShare(user.uid, encryption, saved.day, billId, null);
      } catch (partialError) {
        setError(
          `${PAY_SHARE_WORDS.keepPartial(bill.name, payName)} ${getErrorMessage(partialError, '')}`.trim(),
        );
        return;
      }
      finish(PAY_SHARE_WORDS.ruleToast(bill.name, payName), saved);
    });

  const justThisTime = () => {
    if (!saved) return;
    finish(PAY_SHARE_WORDS.savedToast(bill.name), {
      ...saved,
      stretches: null,
    });
  };

  if (withheld) {
    const pay = withheld.leaveOut.startsWith('The pay on ')
      ? `t${withheld.leaveOut.slice(1)}`
      : withheld.leaveOut;
    return (
      <div className='flex flex-1 flex-col gap-3'>
        <ActionTitle>{PAY_SHARE_WORDS.savedTitle}</ActionTitle>
        <p className='text-muted-foreground text-sm'>
          {PAY_SHARE_WORDS.withheld(pay, bill.name)}
        </p>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='secondary'
            onClick={() =>
              finish(PAY_SHARE_WORDS.savedToast(bill.name), withheld.pending)
            }
          >
            {PAY_SHARE_WORDS.done}
          </Button>
          <Button
            type='button'
            variant='secondary'
            onClick={() => {
              toastSaved(
                PAY_SHARE_WORDS.savedToast(bill.name),
                withheld.pending,
              );
              onOpenPaidFrom();
            }}
          >
            {PAY_SHARE_WORDS.setPaidFrom}
          </Button>
        </div>
      </div>
    );
  }

  if (saved) {
    const payLabel = describePayChoice(saved.rule, plan);
    const payWords = payLabel.startsWith('The pay on ')
      ? `t${payLabel.slice(1)}`
      : payLabel;
    return (
      <div className='flex flex-1 flex-col gap-3'>
        <ActionTitle>{PAY_SHARE_WORDS.keepTitle}</ActionTitle>
        <div className='grid grid-cols-2 gap-2'>
          <KeepChoice
            title={PAY_SHARE_WORDS.keepYes(payWords)}
            body={PAY_SHARE_WORDS.keepYesBody(bill.name, payWords)}
            isDisabled={isSaving}
            onPick={() => void keepForEvery()}
          />
          <KeepChoice
            title={PAY_SHARE_WORDS.keepJustOnce}
            body={PAY_SHARE_WORDS.keepJustOnceBody}
            isDisabled={isSaving}
            onPick={() => justThisTime()}
          />
        </div>
        {error && <InlineNotice tone='warning'>{error}</InlineNotice>}
      </div>
    );
  }

  const getHint = () => {
    if (isHidden || target === null || share === null || shown === null)
      return undefined;
    if (target > share.maxCents) {
      return (
        <MaskedText>
          {PAY_SHARE_WORDS.capped(bill.name, formatCents(share.maxCents))}
        </MaskedText>
      );
    }
    return target > shown.dayMoneyCents ? (
      <MaskedText>
        {PAY_SHARE_WORDS.overPay(
          formatCents(shown.dayMoneyCents),
          formatCents(target - shown.dayMoneyCents),
        )}
      </MaskedText>
    ) : undefined;
  };
  const hasShort = isChanged && share.shortCents > 0;
  const shortLine = hasShort
    ? mask(
        PAY_SHARE_WORDS.short(
          bill.name,
          formatCents(share.shortCents),
          formatDateShortUTC(share.dueOn),
        ),
      )
    : null;

  return (
    <div className='flex flex-1 flex-col gap-3 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{PAY_SHARE_WORDS.title(bill.name)}</ActionTitle>
      <AmountHero
        label={PAY_SHARE_WORDS.amount}
        value={amount}
        onChange={setAmount}
        disabled={isSaving}
        hint={getHint()}
      />
      {rows.length > 0 && (
        <ActionSection caption={PAY_SHARE_WORDS.changes}>
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {[...rows, ...(dayLeftRow ? [dayLeftRow] : [])].map((row) => (
              <li key={row.key} className='px-3 py-2 text-sm'>
                <p className='flex items-baseline justify-between gap-3'>
                  <span className='min-w-0 break-words'>{row.name}</span>
                  <span className='font-medium whitespace-nowrap tabular-nums'>
                    <MaskedText>{row.text}</MaskedText>
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </ActionSection>
      )}
      {hasShort &&
        (isHidden ? (
          <NeedsALookRow />
        ) : (
          <InlineNotice tone='warning'>{shortLine}</InlineNotice>
        ))}
      <ModalFooterActions
        note={error ?? blocker}
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
