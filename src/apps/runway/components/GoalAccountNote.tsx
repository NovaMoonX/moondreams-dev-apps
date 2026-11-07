import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import HelpTip from '@/components/HelpTip';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { shareInterest } from '@apps/runway/engine/interest';
import { useAccountInterest } from '@apps/runway/hooks/useAccountInterest';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
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
  const mask = useMaskedText();
  const holdings = useAppSelector((state) =>
    selectAccountHoldings(state, today),
  )[account.id];
  const goalIdList = useAppSelector((state) =>
    state.runway.items
      .filter((item) => item.kind === 'goal')
      .map((item) => item.id)
      .join(' '),
  );
  const { interest } = useAccountInterest(account, today);
  const goalIds = new Set(goalIdList.split(' '));
  const goals = (holdings?.items ?? [])
    .filter((item) => goalIds.has(item.id))
    .map((item) => ({ id: item.id, heldCents: item.cents }));
  if (!goals.some((goal) => goal.id === goalId)) return null;

  const interestShare =
    interest === null
      ? null
      : formatCents(
          shareInterest(interest.cents, goals, account.balanceCents).byId[
            goalId
          ] ?? 0,
        );
  const interestDay =
    interest === null ? '' : formatDateOrdinalUTC(interest.on);
  if (interest === null || interestShare === null) return null;
  return (
    <div className='flex flex-wrap gap-2'>
      <HelpTip
        title={ACCOUNT_WORDS.interestTitle(account.name)}
        badgeLabel={mask(
          ACCOUNT_WORDS.interestChip(
            interestShare,
            interestDay,
            interest.isActual,
          ),
        )}
      >
        <p>
          <MaskedText>
            {(interest.isActual
              ? ACCOUNT_WORDS.goalInterestActual
              : ACCOUNT_WORDS.goalInterest)(interestShare, interestDay)}
          </MaskedText>
        </p>
      </HelpTip>
    </div>
  );
}

/** What the account holding a goal says about it: its share of the month's interest; nothing when it earns none. */
function GoalAccountNote({ goalId }: GoalAccountNoteProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const holdings = useAppSelector((state) =>
    selectAccountHoldings(state, today),
  );
  const account = useAppSelector((state) =>
    state.runway.accounts.find(
      (entry) =>
        entry.archivedAt === null &&
        entry.apyBps !== null &&
        holdings[entry.id]?.items.some((item) => item.id === goalId),
    ),
  );
  return account ? (
    <AccountLines account={account} goalId={goalId} today={today} />
  ) : null;
}

export default GoalAccountNote;
