import { useRef, useState } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import InlineNotice from '@/components/InlineNotice';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { PAID_FROM_WORDS } from '@apps/runway/constants';
import type { BillPayment } from '@apps/runway/engine/demands';
import { getVersionStretches } from '@apps/runway/engine/resolve';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { changeItem } from '@apps/runway/store/actions/itemActions';
import {
  selectIsDaysLoaded,
  selectIsPlanItemsLoaded,
  selectAllCards,
  selectResolvedPlan,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillSealed, BillVersion } from '@apps/runway/types';
import { useDeferredLookahead } from '@apps/runway/useDeferredLookahead';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { describeChange } from '@apps/runway/utils/changeText';
import {
  describePaidFrom,
  describePayChoice,
} from '@apps/runway/utils/payFrom';

interface BillPaidFromNoticeProps {
  billId: string;
  bill: BillSealed;
  payment: BillPayment | null;
  today: number;
  /** Opens the bill's form at its Paid from question. */
  onPickAnother: () => void;
}

/** When the pay a repeating bill is set to come from can't carry its next payment, says so and offers the two ways out; nothing changes until one is picked. */
function BillPaidFromNotice({
  billId,
  bill,
  payment,
  today,
  onPickAnother,
}: BillPaidFromNoticeProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const mask = useMaskedText();
  const { isHidden } = useValuesHidden();
  const plan = useAppSelector((state) => selectResolvedPlan(state, today));
  const allCards = useAppSelector(selectAllCards);
  const isLoaded = useAppSelector(
    (state) => selectIsPlanItemsLoaded(state) && selectIsDaysLoaded(state),
  );
  const lookahead = useDeferredLookahead(today, isLoaded);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);
  const { fundedBy } = bill;

  if (
    (fundedBy.kind !== 'pay' && fundedBy.kind !== 'lastBefore') ||
    !payment ||
    payment.paid
  )
    return null;

  const dueOn = formatDateShortUTC(payment.dueOn);
  const isUnfunded =
    payment.parts.length === 0 && payment.fundedCents < payment.totalCents;
  const payDays = new Set(payment.parts.map((part) => part.day.dayKey));
  const shortProblem =
    lookahead?.problems.find(
      (problem) =>
        problem.kind === 'short' &&
        problem.itemId === billId &&
        problem.isBill &&
        payDays.has(problem.dayKey),
    ) ?? null;
  const getMessage = () => {
    if (isUnfunded) {
      return fundedBy.kind === 'pay'
        ? PAID_FROM_WORDS.noticeNoPay(
            describePayChoice(fundedBy, plan),
            bill.name,
            dueOn,
          )
        : PAID_FROM_WORDS.noticeNoPayAtAll(bill.name, dueOn);
    }
    if (shortProblem?.kind === 'short') {
      return mask(
        PAID_FROM_WORDS.noticeShort(
          bill.name,
          formatCentsShort(shortProblem.shortBy),
          formatDateShortUTC(shortProblem.on),
        ),
      );
    }
    return null;
  };
  const message = getMessage();
  if (message === null) return null;

  const spread = async () => {
    if (isBusyRef.current || !user) return;
    isBusyRef.current = true;
    setIsBusy(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const stretches = getVersionStretches<BillVersion, BillSealed>(
        store
          .getState()
          .runway.versions.filter(
            (version): version is BillVersion => version.kind === 'bill',
          ),
        billId,
        today,
      );
      const next: BillSealed = { ...bill, fundedBy: { kind: 'suggested' } };
      await changeItem(user.uid, encryption, {
        itemId: billId,
        kind: 'bill',
        payload: next,
        summary: `${bill.name}: ${describeChange(
          bill,
          next,
          getCardNamer(allCards),
          undefined,
          (picked) => describePayChoice(picked, plan),
        )}, from ${formatDateUTC(today)}.`,
        note: null,
        effectiveFrom: today,
        stretches: stretches.map((stretch) => ({
          ...stretch,
          payload: { ...stretch.payload, fundedBy: next.fundedBy },
        })),
      });
      addToast({
        title: PAID_FROM_WORDS.changed(bill.name),
        type: 'success',
        action: {
          label: PAID_FROM_WORDS.undo,
          onClick: () =>
            void changeItem(user.uid, encryption, {
              itemId: billId,
              kind: 'bill',
              payload: bill,
              summary: PAID_FROM_WORDS.paidFromBack(
                bill.name,
                describePaidFrom(bill.fundedBy, plan),
              ),
              note: null,
              effectiveFrom: today,
              stretches,
            }).catch((undoError: unknown) =>
              addToast({
                title: PAID_FROM_WORDS.saveFailed,
                description: getErrorMessage(undoError, ''),
                type: 'error',
              }),
            ),
        },
      });
    } catch (saveError) {
      addToast({
        title: PAID_FROM_WORDS.saveFailed,
        description: getErrorMessage(saveError, ''),
        type: 'error',
      });
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  const buttons = (
    <div className='mt-2 flex flex-wrap gap-2'>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        disabled={isBusy}
        onClick={() => void spread()}
      >
        {PAID_FROM_WORDS.keepSpread}
      </Button>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        disabled={isBusy}
        onClick={onPickAnother}
      >
        {PAID_FROM_WORDS.pickAnother}
      </Button>
    </div>
  );

  if (isHidden) {
    return (
      <div>
        <NeedsALookRow />
        {buttons}
      </div>
    );
  }
  return (
    <InlineNotice tone='warning'>
      <p>{message}</p>
      {buttons}
    </InlineNotice>
  );
}

export default BillPaidFromNotice;
