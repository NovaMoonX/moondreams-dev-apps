import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { ACCOUNT_MOVE_WORDS } from '@apps/runway/constants';
import type { AccountMove } from '@apps/runway/engine/moves';
import type { OpenAccount } from '@apps/runway/types';
import { getAccountMoveName } from '@apps/runway/utils/accountText';

const nameOf = (id: string | null, accounts: readonly OpenAccount[]) => {
  const found = accounts.find((account) => account.id === id);
  return found ? getAccountMoveName(found, accounts) : null;
};

/** The names a move is told with: where it goes and, when the pay named one, where it comes from. */
export const getMoveNames = (
  move: AccountMove,
  accounts: readonly OpenAccount[],
) => ({
  to: nameOf(move.accountId, accounts) ?? '',
  from: nameOf(move.fromAccountId, accounts),
});

/** "Move $1,240 to Capital One B": a Things to fix row's name, with the source and date in its line. */
export const describeMoveShort = (
  move: AccountMove,
  accounts: readonly OpenAccount[],
) =>
  ACCOUNT_MOVE_WORDS.short(
    formatCents(move.moveCents),
    getMoveNames(move, accounts).to,
  );

/** "Move $1,240 from Capital One A to Capital One B by Nov 12th": the title with its date, for Home. */
export const describeMoveSummary = (
  move: AccountMove,
  accounts: readonly OpenAccount[],
) => {
  const { to, from } = getMoveNames(move, accounts);
  return ACCOUNT_MOVE_WORDS.summary(
    formatCents(move.moveCents),
    to,
    from,
    formatDateOrdinalUTC(move.byOn),
  );
};

/** "By Nov 12th · for Discover, Citi and Phone": when it is due and what it is for. */
export const describeMoveBy = (move: AccountMove) =>
  ACCOUNT_MOVE_WORDS.by(
    formatDateOrdinalUTC(move.byOn),
    ACCOUNT_MOVE_WORDS.names(move.items.map((item) => item.name)),
  );
