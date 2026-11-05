import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
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

/** "Move $1,240 from Capital One A to Capital One B". */
export const describeMoveTitle = (
  move: AccountMove,
  accounts: readonly OpenAccount[],
) => {
  const { to, from } = getMoveNames(move, accounts);
  return ACCOUNT_MOVE_WORDS.title(formatCentsShort(move.moveCents), to, from);
};

/** "Move $1,240 from Capital One A to Capital One B by Nov 12th": the title with its date, for Home. */
export const describeMoveSummary = (
  move: AccountMove,
  accounts: readonly OpenAccount[],
) => {
  const { to, from } = getMoveNames(move, accounts);
  return ACCOUNT_MOVE_WORDS.summary(
    formatCentsShort(move.moveCents),
    to,
    from,
    formatDateOrdinalUTC(move.byOn),
  );
};

/** "By Nov 12th · Discover, Citi and Phone", or "By Nov 12th · Capital One B has $300 of $1,240" when its balance was taken off. */
export const describeMoveBy = (
  move: AccountMove,
  accounts: readonly OpenAccount[],
) => {
  const { to } = getMoveNames(move, accounts);
  return ACCOUNT_MOVE_WORDS.by(
    formatDateOrdinalUTC(move.byOn),
    move.balanceCents === null
      ? ACCOUNT_MOVE_WORDS.names(move.items.map((item) => item.name))
      : ACCOUNT_MOVE_WORDS.hasOf(
          to,
          formatCentsShort(move.balanceCents),
          formatCentsShort(move.pullsCents),
        ),
  );
};
