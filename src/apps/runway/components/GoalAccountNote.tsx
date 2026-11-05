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
import { shareInterest } from '@apps/runway/engine/interest';
import { useAccountInterest } from '@apps/runway/hooks/useAccountInterest';
import { selectAccountHoldings } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenAccount } from '@apps/runway/types';

interface GoalAccountNoteProps {
  goalId: string;
}

function AccountLines({
  account,
  goalId,
  today,
}: {
  account: OpenAccount;
  goalId: string;
  today: number;
}) {
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
  const bank = useAppSelector(
    (state) =>
      state.runway.accountBalances.find((entry) => entry.id === account.id) ??
      null,
  );
  const { interest } = useAccountInterest(account, today);
  const goalIds = new Set(goalIdList.split(' '));
  const goals = (holdings?.items ?? [])
    .filter((item) => goalIds.has(item.id))
    .map((item) => ({ id: item.id, heldCents: item.cents }));
  if (!goals.some((goal) => goal.id === goalId)) return null;

  const interestLine =
    interest === null
      ? null
      : (interest.isActual
          ? ACCOUNT_WORDS.goalInterestActual
          : ACCOUNT_WORDS.goalInterest)(
          formatCents(
            shareInterest(interest.cents, goals, account.balanceCents).byId[
              goalId
            ] ?? 0,
          ),
          formatDateOrdinalUTC(interest.on),
        );
  const bankLine = getBankLine(account, goalId, goals, bank, isHidden);
  const lines = [interestLine, bankLine].filter(
    (line): line is string => line !== null,
  );
  if (lines.length === 0) return null;
  return (
    <ActionSection caption={account.name}>
      {lines.map((line) => (
        <p key={line} className='text-sm'>
          <MaskedText>{line}</MaskedText>
        </p>
      ))}
    </ActionSection>
  );
}

function getBankLine(
  account: OpenAccount,
  goalId: string,
  goals: { id: string; heldCents: number }[],
  bank: { cents: number; asOf: number } | null,
  isHidden: boolean,
) {
  if (bank === null || account.linkId === null) return null;
  if (account.balanceCents === null) return null;
  const bankDay = todayAsUtcDate(bank.asOf);
  if (account.balanceOn !== null && bankDay < account.balanceOn) return null;
  const { plannedCents, actualCents, differenceCents } = getGoalActual(
    goalId,
    goals,
    account.balanceCents,
    bank.cents,
  );
  if (differenceCents === 0) return null;
  return ACCOUNT_WORDS.goalActual(
    formatCents(actualCents),
    isHidden
      ? null
      : {
          difference: formatCents(Math.abs(differenceCents)),
          direction: differenceCents > 0 ? 'more' : 'less',
          saved: formatCents(plannedCents),
        },
  );
}

/** What the account holding a goal says about it: its share of the month's interest, and of any difference the bank shows from the typed balance; nothing when neither applies. */
function GoalAccountNote({ goalId }: GoalAccountNoteProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const holdings = useAppSelector((state) =>
    selectAccountHoldings(state, today),
  );
  const account = useAppSelector((state) =>
    state.runway.accounts.find(
      (entry) =>
        entry.archivedAt === null &&
        (entry.apyBps !== null || entry.linkId !== null) &&
        holdings[entry.id]?.items.some((item) => item.id === goalId),
    ),
  );
  return account ? (
    <AccountLines account={account} goalId={goalId} today={today} />
  ) : null;
}

export default GoalAccountNote;
