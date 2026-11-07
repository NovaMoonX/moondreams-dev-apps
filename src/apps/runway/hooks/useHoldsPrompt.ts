import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getHolderById } from '@apps/runway/engine/accounts';
import {
  selectAccounts,
  selectEnvelopes,
  selectGoals,
  selectIsAccountsLoaded,
} from '@apps/runway/store/selectors/runwaySelectors';

export interface UnheldItem {
  id: string;
  name: string;
  emoji: string | null;
}

/** The open goals and envelopes no open account holds, the accounts to pick from (linked first), and whether the "where are they kept" question is worth asking now. */
export function useHoldsPrompt() {
  const now = useNow(60_000);
  const today = todayAsUtcDate(now);
  const isLoaded = useAppSelector(selectIsAccountsLoaded);
  const accounts = useAppSelector(selectAccounts);
  const goals = useAppSelector((state) => selectGoals(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const choice = useAppSelector((state) => state.runway.plan?.holdsPrompt);

  const holderById = getHolderById(accounts);
  const unheld: UnheldItem[] = [...goals, ...envelopes]
    .filter(({ item }) => holderById[item.id] === undefined)
    .map(({ item, version }) => ({
      id: item.id,
      name: version.payload.name,
      emoji: version.payload.emoji,
    }));
  const pickable = [
    ...accounts.filter((account) => account.linkId !== null),
    ...accounts.filter((account) => account.linkId === null),
  ];
  const isWorthAsking =
    isLoaded &&
    unheld.length > 0 &&
    accounts.some((account) => account.linkId !== null);
  const isHidden =
    choice?.isOff === true ||
    (choice?.askAfter != null && now < choice.askAfter);

  return {
    unheld,
    accounts: pickable,
    isWorthAsking,
    isOnHome: isWorthAsking && !isHidden,
  };
}
