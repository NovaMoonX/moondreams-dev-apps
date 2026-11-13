import { useRef, useState } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import InlineNotice from '@/components/InlineNotice';
import {
  NOTICE_ACTION_CLASSES,
  NOTICE_QUIET_CLASSES,
} from '@/components/noticeActionClasses';
import { useAuth } from '@/hooks/useAuth';
import { store } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { BILL_AMOUNT_HINT_WORDS } from '@apps/runway/constants';
import { useBillAmountHint } from '@apps/runway/hooks/useRecurring';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  revertBillAmount,
  writeBillAmount,
} from '@apps/runway/store/actions/billAmountActions';
import type { BillSealed, BillVersion, MoneyRange } from '@apps/runway/types';
import { describeChange } from '@apps/runway/utils/changeText';
import { formatRange } from '@apps/runway/utils/rangeText';
import { dismissRecurring } from '@apps/runway/utils/recurringDismissed';

interface BillAmountNoticeProps {
  billId: string;
  bill: BillSealed;
  today: number;
}

const formatDash = (range: MoneyRange) =>
  range.lowCents === range.highCents
    ? formatCents(range.lowCents)
    : `${formatCents(range.lowCents)}–${formatCents(range.highCents)}`;

const describe = (before: BillSealed, after: BillSealed) =>
  describeChange(before, after, () => '');

/** When the bank's repeating charge for a bill differs from the bill's amount, says so and offers to change it from today on; nothing changes until the person says yes. */
function BillAmountNotice({ billId, bill, today }: BillAmountNoticeProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const hint = useBillAmountHint(billId, today);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);

  if (!hint || hint.kind !== 'amount') return null;

  const { suggested } = hint;
  const isRange = suggested.lowCents !== suggested.highCents;

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
        title: BILL_AMOUNT_HINT_WORDS.done(bill.name, formatDash(suggested)),
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

  return (
    <InlineNotice tone='info'>
      <p>
        <MaskedText>
          {(isRange
            ? BILL_AMOUNT_HINT_WORDS.range
            : BILL_AMOUNT_HINT_WORDS.single)(
            formatRange(suggested),
            formatRange(hint.current),
          )}
        </MaskedText>
      </p>
      <p className='mt-1 text-xs opacity-80'>
        {BILL_AMOUNT_HINT_WORDS.fromToday}
      </p>
      <div className='mt-2 flex flex-wrap gap-2'>
        <Button
          type='button'
          size='sm'
          className={NOTICE_ACTION_CLASSES.info}
          disabled={isBusy}
          onClick={() => void change()}
        >
          <span>
            <MaskedText>
              {BILL_AMOUNT_HINT_WORDS.changeIt(formatDash(suggested))}
            </MaskedText>
          </span>
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className={NOTICE_QUIET_CLASSES.info}
          disabled={isBusy}
          onClick={() => {
            if (user) dismissRecurring(user.uid, hint.key);
          }}
        >
          {BILL_AMOUNT_HINT_WORDS.notThisOne}
        </Button>
      </div>
    </InlineNotice>
  );
}

export default BillAmountNotice;
