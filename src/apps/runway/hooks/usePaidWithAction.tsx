import { CreditCard } from 'lucide-react';

import { useAppSelector } from '@/store';
import {
  ACCOUNT_WORDS,
  AUTO_PAY_WORDS,
  BILL_PAY_WORDS,
} from '@apps/runway/constants';
import { getPullAccounts } from '@apps/runway/engine/accounts';
import { isTrackingLevel } from '@apps/runway/engine/level';
import { resolveCurrentOrNext } from '@apps/runway/engine/resolve';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import {
  selectAccounts,
  selectAllCards,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { BillVersion } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';

/** A bill's "Paid with" row, naming its card or account and opening that question of its form; undefined when the bill has no way of paying to choose. */
export function usePaidWithAction(billId: string, today: number) {
  const isTracking = isTrackingLevel(useAppSelector(selectLevel));
  const allCards = useAppSelector(selectAllCards);
  const openAccounts = useAppSelector(selectAccounts);
  const bill = useAppSelector((state) =>
    resolveCurrentOrNext(
      state.runway.versions.filter(
        (version): version is BillVersion => version.kind === 'bill',
      ),
      billId,
      today,
    ),
  )?.payload;
  if (!bill) return undefined;
  const liveCards = isTracking
    ? allCards.filter((card) => card.archivedAt === null)
    : [];
  const pullAccounts = getPullAccounts(openAccounts);
  const shownAccounts = pullAccounts.length >= 2 ? pullAccounts : [];
  if (!isTracking && shownAccounts.length === 0) return undefined;
  const card = liveCards.find((found) => found.id === bill.paidByCardId);
  const account = shownAccounts.find((found) => found.id === bill.accountId);
  const getWay = () => {
    if (card) return getCardName(card, allCards);
    if (account) return account.name;
    return shownAccounts.length > 0
      ? ACCOUNT_WORDS.payFromNone
      : BILL_PAY_WORDS.fromBank;
  };
  const selfPaying =
    isTracking && bill.paysItself ? ` · ${AUTO_PAY_WORDS.formSummary}` : '';
  return {
    label: BILL_PAY_WORDS.label,
    subtitle: `${getWay()}${selfPaying}`,
    step: 'paidWith',
    icon: <CreditCard />,
  };
}
