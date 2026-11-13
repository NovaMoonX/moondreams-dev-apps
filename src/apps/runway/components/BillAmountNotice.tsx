import { useMemo, useRef, useState } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import InlineNotice from '@/components/InlineNotice';
import { NOTICE_QUIET_CLASSES } from '@/components/noticeActionClasses';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { BILL_AMOUNT_HINT_WORDS } from '@apps/runway/constants';
import type { RecurringHint } from '@apps/runway/engine/recurring';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { planStretches } from '@apps/runway/engine/resolve';
import {
  previewBillCover,
  previewLookahead,
  type PreviewChange,
  type PreviewVersion,
} from '@apps/runway/store/selectors/previewSelectors';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCreatedProblems } from '@apps/runway/utils/lookaheadText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  revertBillAmount,
  writeBillAmount,
} from '@apps/runway/store/actions/billAmountActions';
import type {
  BillSealed,
  BillVersion,
  MoneyRange,
  OpenVersion,
} from '@apps/runway/types';
import {
  describeChange,
  type ItemPayload,
} from '@apps/runway/utils/changeText';
import { formatRange } from '@apps/runway/utils/rangeText';
import {
  dismissRecurring,
  undismissRecurring,
} from '@apps/runway/utils/recurringDismissed';

interface BillAmountNoticeProps {
  billId: string;
  bill: BillSealed;
  hint: Extract<RecurringHint, { kind: 'amount' }>;
  today: number;
  /** Opens the bill's change form with this amount typed in, when saving it would leave the plan short. */
  onReview: (amount: MoneyRange) => void;
}

const middleOf = (range: MoneyRange) =>
  Math.round((range.lowCents + range.highCents) / 2);

const QUIET_PRIMARY_CLASSES =
  "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

/** Works the effect out from the store as it is now; throws when a preview can't be built. */
const readAmountEffect = (
  versions: readonly OpenVersion[],
  billId: string,
  bill: BillSealed,
  lowCents: number,
  highCents: number,
  today: number,
) => {
  const next: BillSealed = { ...bill, amount: { lowCents, highCents } };
  const plan = planStretches<OpenVersion, ItemPayload>(
    versions,
    billId,
    { effectiveFrom: today, effectiveUntil: null },
    bill,
    next,
  );
  const change: PreviewChange = {
    kind: 'versions',
    versions: plan.written.map(
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
  };
  const state = store.getState();
  const { before, after } = previewLookahead(state, today, change);
  const cover = previewBillCover(state, change);
  const covered = cover.after.payments
    .map((payment) => ({
      payment,
      more:
        payment.coveredCents -
        (cover.before.payments.find(
          (entry) =>
            entry.billId === payment.billId && entry.dueOn === payment.dueOn,
        )?.coveredCents ?? 0),
    }))
    .filter(({ payment, more }) => payment.billId === billId && more > 0)
    .sort((a, b) => a.payment.dueOn - b.payment.dueOn)[0];
  return {
    createsProblem:
      getCreatedProblems(before.problems, after.problems).length > 0,
    covered: covered
      ? { cents: covered.more, dueOn: covered.payment.dueOn }
      : null,
  };
};

/** What saving the bank's amount from today would do to the plan: a Thing to fix it would create, and the first payment Free to Spend would cover more of. */
function useAmountEffect(
  billId: string,
  bill: BillSealed,
  suggested: MoneyRange,
  today: number,
) {
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const days = useAppSelector((state) => state.runway.days);
  const isReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const { lowCents, highCents } = suggested;
  return useMemo(() => {
    if (!isReady) return null;
    try {
      return readAmountEffect(
        versions,
        billId,
        bill,
        lowCents,
        highCents,
        today,
      );
    } catch {
      // A preview that can't be worked out sends the person to the Change form, which shows its own.
      return { createsProblem: true, covered: null };
    }
    // Items and days feed the previews through the store snapshot they read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady,
    items,
    versions,
    days,
    billId,
    bill,
    lowCents,
    highCents,
    today,
  ]);
}

const formatDash = (range: MoneyRange) =>
  range.lowCents === range.highCents
    ? formatCents(range.lowCents)
    : `${formatCents(range.lowCents)}–${formatCents(range.highCents)}`;

const describe = (before: BillSealed, after: BillSealed) =>
  describeChange(before, after, () => '');

/** When the bank's repeating charge for a bill differs from the bill's amount, says so and offers to change it from today on; nothing changes until the person says yes. */
function BillAmountNotice({
  billId,
  bill,
  hint,
  today,
  onReview,
}: BillAmountNoticeProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const mask = useMaskedText();
  const { suggested } = hint;
  const effect = useAmountEffect(billId, bill, suggested, today);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);

  if (isHidden) return null;

  const isRange = suggested.lowCents !== suggested.highCents;
  const difference = middleOf(suggested) - middleOf(hint.current);
  const differenceLine =
    difference === 0
      ? null
      : (difference > 0
          ? BILL_AMOUNT_HINT_WORDS.more
          : BILL_AMOUNT_HINT_WORDS.less)(formatCents(Math.abs(difference)));

  const change = async () => {
    if (isBusyRef.current || !user) return;
    if (!navigator.onLine) {
      addToast({ title: BILL_AMOUNT_HINT_WORDS.offline, type: 'error' });
      return;
    }
    isBusyRef.current = true;
    setIsBusy(true);
    const tell = (title: string, error: unknown) =>
      addToast({
        title,
        description: getErrorMessage(error, ''),
        type: 'error',
      });
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const liveBills = () =>
        store
          .getState()
          .runway.versions.filter(
            (version): version is BillVersion => version.kind === 'bill',
          );
      const next: BillSealed = { ...bill, amount: { ...suggested } };
      const before = await writeBillAmount(user.uid, encryption, {
        billId,
        versions: liveBills(),
        today,
        amount: suggested,
        summary: `${bill.name}: ${describe(bill, next)}, from ${formatDateOrdinalUTC(today)}.`,
      });
      if (!before) {
        addToast({
          title: BILL_AMOUNT_HINT_WORDS.alreadyHolds(bill.name),
          type: 'info',
        });
        return;
      }
      const undoState = { isTaken: false };
      const undo = async () => {
        if (undoState.isTaken) return;
        if (!navigator.onLine) {
          addToast({ title: BILL_AMOUNT_HINT_WORDS.offline, type: 'error' });
          return;
        }
        undoState.isTaken = true;
        try {
          await revertBillAmount(user.uid, encryption, {
            billId,
            versions: liveBills(),
            today,
            wrote: suggested,
            back: before,
            summary: `${bill.name}: ${describe(next, bill)}, from ${formatDateOrdinalUTC(today)}.`,
          });
        } catch (undoError) {
          undoState.isTaken = false;
          tell(BILL_AMOUNT_HINT_WORDS.undoFailed, undoError);
        }
      };
      addToast({
        title: mask(
          BILL_AMOUNT_HINT_WORDS.done(bill.name, formatDash(suggested)),
        ),
        type: 'success',
        action: {
          label: BILL_AMOUNT_HINT_WORDS.undo,
          onClick: () => void undo(),
        },
      });
    } catch (saveError) {
      tell(BILL_AMOUNT_HINT_WORDS.saveFailed, saveError);
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const notThisOne = () => {
    if (!user) return;
    dismissRecurring(user.uid, hint.key);
    addToast({
      title: BILL_AMOUNT_HINT_WORDS.wontSuggest(bill.name),
      type: 'success',
      action: {
        label: BILL_AMOUNT_HINT_WORDS.undo,
        onClick: () => undismissRecurring(user.uid, hint.key),
      },
    });
  };

  return (
    <InlineNotice tone='info'>
      <p>
        <MaskedText>
          {isRange
            ? BILL_AMOUNT_HINT_WORDS.range(
                formatCents(suggested.lowCents),
                formatCents(suggested.highCents),
                formatRange(hint.current),
              )
            : BILL_AMOUNT_HINT_WORDS.single(
                formatCents(suggested.lowCents),
                formatRange(hint.current),
              )}
        </MaskedText>
      </p>
      {differenceLine !== null && (
        <p className='mt-1 text-xs opacity-80'>
          <MaskedText>{differenceLine}</MaskedText>
        </p>
      )}
      {effect?.covered && (
        <p className='mt-1 text-xs opacity-80'>
          <MaskedText>
            {BILL_AMOUNT_HINT_WORDS.covers(
              formatCents(effect.covered.cents),
              formatDateOrdinalUTC(effect.covered.dueOn),
            )}
          </MaskedText>
        </p>
      )}
      <div className='mt-2 flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className={QUIET_PRIMARY_CLASSES}
          disabled={isBusy || effect === null}
          onClick={() =>
            effect?.createsProblem ? onReview(suggested) : void change()
          }
        >
          <span>
            <MaskedText>
              {(effect?.createsProblem
                ? BILL_AMOUNT_HINT_WORDS.reviewIt
                : BILL_AMOUNT_HINT_WORDS.changeIt)(formatDash(suggested))}
            </MaskedText>
          </span>
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className={NOTICE_QUIET_CLASSES.info}
          disabled={isBusy}
          onClick={notThisOne}
        >
          {BILL_AMOUNT_HINT_WORDS.notThisOne}
        </Button>
      </div>
    </InlineNotice>
  );
}

export default BillAmountNotice;
