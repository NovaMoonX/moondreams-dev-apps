import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getGoalActual } from '@apps/runway/engine/goalActual';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectAccountHoldings } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenAccount } from '@apps/runway/types';

interface GoalBankNoteProps {
  goalId: string;
}

function BankLine({
  account,
  goalId,
  bank,
}: {
  account: OpenAccount;
  goalId: string;
  bank: { cents: number; asOf: number };
}) {
  const today = todayAsUtcDate(useNow(60_000));
  const { isHidden } = useValuesHidden();
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
  const items = holdings?.items ?? [];
  if (account.balanceCents === null || !items.some((i) => i.id === goalId)) {
    return null;
  }
  const goals = items
    .filter((item) => goalIds.has(item.id))
    .map((item) => ({ id: item.id, heldCents: assigned[item.id] ?? 0 }));
  const { actualCents, differenceCents } = getGoalActual(
    goalId,
    goals,
    account.balanceCents,
    bank.cents,
  );
  const bankDay = todayAsUtcDate(bank.asOf);
  const text = ACCOUNT_WORDS.goalActual(
    account.name,
    formatCents(actualCents),
    formatCents(Math.abs(differenceCents)),
    isHidden
      ? null
      : differenceCents === 0
        ? 'same'
        : differenceCents > 0
          ? 'more'
          : 'less',
    bankDay === today ? null : formatDateOrdinalUTC(bankDay),
  );
  return (
    <ActionSection caption={ACCOUNT_WORDS.goalActualCaption}>
      <p className='text-sm'>
        <MaskedText>{text}</MaskedText>
      </p>
    </ActionSection>
  );
}

/** What the bank says a goal's linked account holds for it, as its share of the account's difference from the plan; nothing for an unlinked account or one the bank has not reported. */
function GoalBankNote({ goalId }: GoalBankNoteProps) {
  const account = useAppSelector((state) =>
    state.runway.accounts.find(
      (entry) =>
        entry.archivedAt === null &&
        entry.linkId !== null &&
        entry.holds.includes(goalId),
    ),
  );
  const bank = useAppSelector((state) =>
    account === undefined
      ? null
      : (state.runway.accountBalances.find(
          (entry) => entry.id === account.id,
        ) ?? null),
  );
  return account && bank ? (
    <BankLine account={account} goalId={goalId} bank={bank} />
  ) : null;
}

export default GoalBankNote;
