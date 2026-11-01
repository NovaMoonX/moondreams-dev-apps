import { useMemo, useState } from 'react';
import { useStore } from 'react-redux';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

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
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { findPayRule } from '@apps/runway/engine/billShare';
import {
  getVersionStretches,
  resolveCurrentOrNext,
} from '@apps/runway/engine/resolve';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import { saveDayOverride } from '@apps/runway/store/actions/dayActions';
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
  DayOverrideSealed,
} from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { describeChange } from '@apps/runway/utils/changeText';
import { describePayChoice, getPayMonthDay } from '@apps/runway/utils/payFrom';

interface BillShareViewProps {
  billId: string;
  dayKey: string;
  /** What this pay puts toward the bill now. */
  currentCents: Cents;
  onBack: () => void;
  onClose: () => void;
}

type PayRule = Extract<BillFundedBy, { kind: 'pay' }>;

const withoutBill = (current: DayOverrideSealed, billId: string) => ({
  ...current,
  billCents: Object.fromEntries(
    Object.entries(current.billCents).filter(([id]) => id !== billId),
  ),
});

/** The view a bill's sheet swaps in on an income day: what this one pay puts toward the bill, its effect on the other pays, and then whether to keep it for every pay. */
function BillShareView({
  billId,
  dayKey,
  currentCents,
  onBack,
  onClose,
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
  const [saved, setSaved] = useState<{
    rule: PayRule;
    previous: Cents | null;
    cents: Cents;
  } | null>(null);

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
  const figure = (cents: Cents) => formatCents(cents);
  const rows = isChanged
    ? share.rows.map((row) => ({
        key: row.dayKey,
        name: PAY_SHARE_WORDS.payRow(formatDateShortUTC(row.on)),
        text: `${figure(row.beforeCents)} → ${figure(row.afterCents)}`,
      }))
    : [];
  const dayLeftRow =
    isChanged && shown && shown.leftBeforeCents !== shown.leftAfterCents
      ? {
          key: 'left',
          name: DRAFT_WORDS.dayLeft,
          text: `${figure(shown.leftBeforeCents)} → ${figure(shown.leftAfterCents)}`,
        }
      : null;
  const previous = openDays.find((entry) => entry.id === dayKey)?.override
    .billCents[billId];

  const writeShare = (billCents: Cents | null, log: string | null) =>
    (async () => {
      if (!user || day === null) return;
      const encryption = await getRunwayEncryption(user.uid);
      await saveDayOverride(
        user.uid,
        encryption,
        {
          payLineId: day.payLineId,
          sourceId: day.sourceId,
          expectedOn: day.on,
        },
        (current) =>
          billCents === null
            ? withoutBill(current, billId)
            : {
                ...current,
                billCents: { ...current.billCents, [billId]: billCents },
              },
        log === null ? undefined : { itemId: billId, summary: log, note: null },
      );
    })();

  const undoShare = (before: Cents | undefined, rule: PayRule | null) => {
    if (!day) return;
    void (async () => {
      try {
        if (rule !== null) {
          const encryption = user ? await getRunwayEncryption(user.uid) : null;
          if (user && encryption) {
            await changeItem(user.uid, encryption, {
              itemId: billId,
              kind: 'bill',
              payload: bill,
              summary: `${bill.name}: undid the change to Paid from.`,
              note: null,
              effectiveFrom: today,
              stretches: getVersionStretches<BillVersion, BillSealed>(
                store
                  .getState()
                  .runway.versions.filter(
                    (version): version is BillVersion =>
                      version.kind === 'bill',
                  ),
                billId,
                today,
              ).map((stretch) => ({
                ...stretch,
                payload: { ...stretch.payload, fundedBy: bill.fundedBy },
              })),
            });
          }
        }
        await writeShare(
          before ?? null,
          PAY_SHARE_WORDS.undoSummary(bill.name, formatDateUTC(day.on)),
        );
      } catch (undoError) {
        addToast({
          title: PAY_SHARE_WORDS.undoFailed,
          description: getErrorMessage(undoError, ''),
          type: 'error',
        });
      }
    })();
  };

  const finish = (
    title: string,
    before: Cents | undefined,
    rule: PayRule | null,
  ) => {
    addToast({
      title,
      type: 'success',
      action: {
        label: PAY_SHARE_WORDS.undo,
        onClick: () => undoShare(before, rule),
      },
    });
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
      if (!share || !day || blocker !== null) return;
      await writeShare(
        share.cents,
        PAY_SHARE_WORDS.summary(
          bill.name,
          formatCents(share.cents),
          formatDateUTC(day.on),
        ),
      );
      const rule = findPayRule(share, dayKey, (payLineId, on) =>
        getPayMonthDay(plan, payLineId, on),
      );
      if (rule === null) {
        finish(PAY_SHARE_WORDS.savedToast(bill.name), previous, null);
        return;
      }
      setSaved({ rule, previous: previous ?? null, cents: share.cents });
    });

  const keepForEvery = () =>
    run(async () => {
      if (!saved || !user || !day) return;
      const encryption = await getRunwayEncryption(user.uid);
      const next: BillSealed = { ...bill, fundedBy: saved.rule };
      const stretches = getVersionStretches<BillVersion, BillSealed>(
        store
          .getState()
          .runway.versions.filter(
            (version): version is BillVersion => version.kind === 'bill',
          ),
        billId,
        today,
      );
      await changeItem(user.uid, encryption, {
        itemId: billId,
        kind: 'bill',
        payload: next,
        summary: `${bill.name}: ${describeChange(bill, next, getCardNamer(allCards))}, from ${formatDateUTC(today)}.`,
        note: null,
        effectiveFrom: today,
        stretches: stretches.map((stretch) => ({
          ...stretch,
          payload: { ...stretch.payload, fundedBy: saved.rule },
        })),
      });
      await writeShare(null, null);
      finish(
        PAY_SHARE_WORDS.ruleToast(
          bill.name,
          describePayChoice(saved.rule, plan),
        ),
        saved.previous ?? undefined,
        saved.rule,
      );
    });

  const justThisTime = () => {
    if (!saved) return;
    finish(
      PAY_SHARE_WORDS.savedToast(bill.name),
      saved.previous ?? undefined,
      null,
    );
  };

  if (saved) {
    const payLabel = describePayChoice(saved.rule, plan);
    const payWords = payLabel.startsWith('The ')
      ? `t${payLabel.slice(1)}`
      : payLabel;
    const options = [
      {
        key: 'yes',
        title: PAY_SHARE_WORDS.keepYes(payWords),
        body: PAY_SHARE_WORDS.keepYesBody(bill.name, payWords),
        onClick: () => void keepForEvery(),
      },
      {
        key: 'once',
        title: PAY_SHARE_WORDS.keepJustOnce,
        body: PAY_SHARE_WORDS.keepJustOnceBody,
        onClick: justThisTime,
      },
    ];
    return (
      <div className='flex flex-1 flex-col gap-3'>
        <ActionTitle>{PAY_SHARE_WORDS.keepTitle}</ActionTitle>
        <div className='grid grid-cols-2 gap-2'>
          {options.map((option) => (
            <Button
              key={option.key}
              type='button'
              variant='tertiary'
              disabled={isSaving}
              className={join(
                'text-foreground! border-border h-auto w-full flex-col items-start justify-start gap-0 rounded-2xl border px-3! py-1.5! text-left font-normal whitespace-normal',
              )}
              onClick={option.onClick}
            >
              <span className='text-[15px] leading-[1.125rem] font-medium'>
                {option.title}
              </span>
              <span className='text-muted-foreground block text-[13px] leading-[1.125rem]'>
                {option.body}
              </span>
            </Button>
          ))}
        </div>
        {error && <InlineNotice tone='warning'>{error}</InlineNotice>}
      </div>
    );
  }

  const shortLine =
    isChanged && share.shortCents > 0
      ? isHidden
        ? null
        : mask(
            PAY_SHARE_WORDS.short(
              bill.name,
              formatCents(share.shortCents),
              formatDateShortUTC(share.dueOn),
            ),
          )
      : null;
  const isHiddenShort = isChanged && share.shortCents > 0 && isHidden;

  return (
    <div className='flex flex-1 flex-col gap-3 [&_.form-footer]:mt-auto'>
      <BackLink onBack={onBack} />
      <ActionTitle>{PAY_SHARE_WORDS.title(bill.name)}</ActionTitle>
      <AmountHero
        label={PAY_SHARE_WORDS.amount}
        value={amount}
        onChange={setAmount}
        disabled={isSaving}
        hint={
          target !== null && share !== null && target > share.maxCents ? (
            <MaskedText>
              {PAY_SHARE_WORDS.capped(bill.name, formatCents(share.maxCents))}
            </MaskedText>
          ) : undefined
        }
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
      {shortLine && <InlineNotice tone='warning'>{shortLine}</InlineNotice>}
      {isHiddenShort && <NeedsALookRow />}
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
