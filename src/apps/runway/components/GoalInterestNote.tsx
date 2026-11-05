import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { shareInterest } from '@apps/runway/engine/interest';
import { useAccountInterest } from '@apps/runway/hooks/useAccountInterest';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectAccountHoldings } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenAccount } from '@apps/runway/types';

interface GoalInterestNoteProps {
  goalId: string;
}

function ShareLine({
  account,
  goalId,
}: {
  account: OpenAccount;
  goalId: string;
}) {
  const today = todayAsUtcDate(useNow(60_000));
  const holdings = useAppSelector((state) =>
    selectAccountHoldings(state, today),
  )[account.id];
  const goalIdList = useAppSelector((state) =>
    state.runway.items
      .filter((item) => item.kind === 'goal')
      .map((item) => item.id)
      .join(' '),
  );
  const goalIds = new Set(goalIdList.split(' '));
  const assigned = useAppSelector(selectBalances).assignedByItem;
  const { interest } = useAccountInterest(account, today);
  const items = holdings?.items ?? [];
  if (interest === null || !items.some((item) => item.id === goalId)) {
    return null;
  }
  const goals = items
    .filter((item) => goalIds.has(item.id))
    .map((item) => ({ id: item.id, heldCents: assigned[item.id] ?? 0 }));
  const share = shareInterest(interest.cents, goals, account.balanceCents).byId[
    goalId
  ];
  const day = formatDateOrdinalUTC(interest.on);
  const text = interest.isActual
    ? ACCOUNT_WORDS.goalInterestActual(formatCents(share), day, account.name)
    : ACCOUNT_WORDS.goalInterest(formatCents(share), day, account.name);
  return (
    <ActionSection caption={ACCOUNT_WORDS.interestCaption}>
      <p className='text-sm'>
        <MaskedText>{text}</MaskedText>
      </p>
    </ActionSection>
  );
}

/** The goal's share of the interest its account earns this month, as an estimate until the bank's balance settles it; nothing when its account earns none. */
function GoalInterestNote({ goalId }: GoalInterestNoteProps) {
  const account = useAppSelector((state) =>
    state.runway.accounts.find(
      (entry) =>
        entry.archivedAt === null &&
        entry.apyBps !== null &&
        entry.holds.includes(goalId),
    ),
  );
  return account ? <ShareLine account={account} goalId={goalId} /> : null;
}

export default GoalInterestNote;
