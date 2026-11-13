import { useRef, useState } from 'react';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import InlineNotice from '@/components/InlineNotice';
import {
  NOTICE_ACTION_CLASSES,
  NOTICE_QUIET_CLASSES,
} from '@/components/noticeActionClasses';
import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { ACCOUNT_WORDS, CHARGED_TO_HINT_WORDS } from '@apps/runway/constants';
import { useChargedToHint } from '@apps/runway/hooks/useChargedTo';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  revertChargedTo,
  withChargedTo,
  writeChargedTo,
} from '@apps/runway/store/actions/billChargedToActions';
import {
  selectAllAccounts,
  selectAllCards,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillSealed, BillVersion } from '@apps/runway/types';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { declineChargedTo } from '@apps/runway/utils/chargedToDeclined';
import { getPlaceNamer } from '@apps/runway/utils/chargedToText';
import { describeChange } from '@apps/runway/utils/changeText';

interface BillChargedToNoticeProps {
  billId: string;
  bill: BillSealed;
  today: number;
}

/** When a bill's recent bank charges were on a card or account other than the one it names, says so and offers to charge it there; nothing changes until the person says yes. */
function BillChargedToNotice({
  billId,
  bill,
  today,
}: BillChargedToNoticeProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const hint = useChargedToHint(billId, today);
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAllAccounts);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);

  if (!hint) return null;

  const nameOf = getPlaceNamer(cards, accounts);
  const place = nameOf(hint.place);
  const accountNamer = (accountId: string | null) =>
    accounts.find((account) => account.id === accountId)?.name ??
    ACCOUNT_WORDS.payFromNone;
  const describe = (before: BillSealed, after: BillSealed) =>
    describeChange(
      before,
      after,
      getCardNamer(cards),
      undefined,
      undefined,
      accountNamer,
    );

  const charge = async () => {
    if (isBusyRef.current || !user) return;
    if (!navigator.onLine) {
      addToast({ title: CHARGED_TO_HINT_WORDS.offline, type: 'error' });
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
      const next = withChargedTo(bill, hint.place);
      const before = await writeChargedTo(user.uid, encryption, {
        billId,
        versions: liveBills(),
        today,
        place: hint.place,
        summary: `${bill.name}: ${describe(bill, next)}, from ${formatDateOrdinalUTC(today)}.`,
      });
      const undoState = { isTaken: false };
      const undo = async () => {
        if (undoState.isTaken) return;
        if (!navigator.onLine) {
          addToast({ title: CHARGED_TO_HINT_WORDS.offline, type: 'error' });
          return;
        }
        undoState.isTaken = true;
        try {
          if (before) {
            await revertChargedTo(user.uid, encryption, {
              billId,
              versions: liveBills(),
              today,
              wrote: hint.place,
              back: before,
              summary: `${bill.name}: ${describe(next, bill)}, from ${formatDateOrdinalUTC(today)}.`,
            });
          }
        } catch (undoError) {
          undoState.isTaken = false;
          tell(CHARGED_TO_HINT_WORDS.undoFailed, undoError);
        }
      };
      addToast({
        title: CHARGED_TO_HINT_WORDS.done(bill.name, place),
        type: 'success',
        action: {
          label: CHARGED_TO_HINT_WORDS.undo,
          onClick: () => void undo(),
        },
      });
    } catch (saveError) {
      tell(CHARGED_TO_HINT_WORDS.saveFailed, saveError);
    } finally {
      isBusyRef.current = false;
      setIsBusy(false);
    }
  };

  return (
    <InlineNotice tone='info'>
      <p>
        {CHARGED_TO_HINT_WORDS.summary(
          hint.chargeCount,
          place,
          hint.named ? nameOf(hint.named) : null,
        )}
      </p>
      <p className='mt-1 text-xs opacity-80'>
        {CHARGED_TO_HINT_WORDS.fromToday}
      </p>
      <div className='mt-2 flex flex-wrap gap-2'>
        <Button
          type='button'
          size='sm'
          className={NOTICE_ACTION_CLASSES.info}
          disabled={isBusy}
          onClick={() => void charge()}
        >
          {CHARGED_TO_HINT_WORDS.chargeIt(place)}
        </Button>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className={NOTICE_QUIET_CLASSES.info}
          disabled={isBusy}
          onClick={() => declineChargedTo(billId, hint.place)}
        >
          {CHARGED_TO_HINT_WORDS.notThisOne}
        </Button>
      </div>
    </InlineNotice>
  );
}

export default BillChargedToNotice;
