import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import type { OpenAccount } from '@apps/runway/types';
import { describeAccountLine } from '@apps/runway/utils/accountText';

interface AccountRowProps {
  account: OpenAccount;
  onOpen: () => void;
}

/** An account as a row: the bank's initial, its name, the bank and last 4 digits, and what it holds. */
function AccountRow({ account, onOpen }: AccountRowProps) {
  const hasBalance = account.balanceCents !== null;
  return (
    <ItemRow
      name={account.name}
      leading={<ItemBadge name={account.institution} emoji={null} />}
      detail={describeAccountLine(account)}
      figure={
        account.balanceCents === null
          ? ACCOUNT_WORDS.noBalance
          : formatCents(account.balanceCents)
      }
      isPrivate={hasBalance}
      isFigureMuted={!hasBalance}
      ariaLabel={`${account.name}. Open`}
      onOpen={onOpen}
    />
  );
}

export default AccountRow;
