import { useState } from 'react';
import { Undo2 } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import InlineNotice from '@/components/InlineNotice';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { MaskedText } from '@apps/runway/components/MaskedText';
import {
  CORRECT_WORDS,
  DEPOSIT_WORDS,
  NEEDS_HOME_WORDS,
} from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { unlinkDeposit } from '@apps/runway/store/actions/purchaseActions';
import { selectLinkedDeposit } from '@apps/runway/store/selectors/runwaySelectors';
import { describeDepositLinked } from '@apps/runway/utils/purchaseText';

interface DepositFoundProps {
  dayKey: string;
  /** What a confirmed day stands on; null while the day is still coming. */
  confirmedCents: number | null;
  /** Opens the day's correction, offered beside a difference; null when the day cannot be corrected. */
  onCorrect: (() => void) | null;
}

/** The deposit linked to an income day, as one line; on a confirmed day that stands on another amount it also says by how much, with the correction as its door. */
export function DepositFound({
  dayKey,
  confirmedCents,
  onCorrect,
}: DepositFoundProps) {
  const deposit = useAppSelector((state) => selectLinkedDeposit(state, dayKey));
  const accounts = useAppSelector((state) => state.runway.accounts);
  if (deposit === null) return null;
  const received = -deposit.amountCents;
  const account =
    accounts.find((entry) => entry.id === deposit.accountId)?.name ??
    NEEDS_HOME_WORDS.fromBank;
  const difference = confirmedCents === null ? 0 : received - confirmedCents;
  return (
    <InlineNotice tone='info'>
      <p>
        <MaskedText>
          {DEPOSIT_WORDS.found(
            formatCents(received),
            account,
            formatDateOrdinalUTC(deposit.date),
          )}
        </MaskedText>
      </p>
      {difference !== 0 && (
        <>
          <p>
            <MaskedText>
              {DEPOSIT_WORDS.foundDifferent(
                difference > 0
                  ? DEPOSIT_WORDS.moreThan(formatCents(difference))
                  : DEPOSIT_WORDS.lessThan(formatCents(-difference)),
              )}
            </MaskedText>
          </p>
          {onCorrect !== null && (
            <Button
              variant='secondary'
              size='sm'
              className="relative mt-2 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
              onClick={onCorrect}
            >
              {CORRECT_WORDS.door}
            </Button>
          )}
        </>
      )}
    </InlineNotice>
  );
}

/** Sends the day's linked deposit back to Needs a home; a failure reads in the row's own subtitle. */
export function UnlinkDepositRow({
  dayKey,
  dayOn,
}: {
  dayKey: string;
  dayOn: number;
}) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const deposit = useAppSelector((state) => selectLinkedDeposit(state, dayKey));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (deposit === null) return null;

  const unlink = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await unlinkDeposit(
        user.uid,
        await getRunwayEncryption(user.uid),
        deposit,
        describeDepositLinked(deposit, dayOn, true),
      );
      addToast({ title: DEPOSIT_WORDS.unlinked, type: 'success' });
    } catch (unlinkError) {
      setError(getErrorMessage(unlinkError, DEPOSIT_WORDS.unlinkFailed));
      setIsBusy(false);
    }
  };

  return (
    <ActionRow
      isGrouped
      isRoomy
      icon={<Undo2 />}
      label={DEPOSIT_WORDS.unlink}
      subtitle={error ?? DEPOSIT_WORDS.unlinkSub}
      isDisabled={isBusy}
      onClick={() => void unlink()}
    />
  );
}
