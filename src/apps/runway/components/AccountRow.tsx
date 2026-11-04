import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import type { OpenAccount } from '@apps/runway/types';
import { describeAccountLine } from '@apps/runway/utils/accountText';

interface AccountRowProps {
  account: OpenAccount;
  /** The balance less what the account holds; below zero the row says it is short. Null while unknown. */
  unassignedCents: number | null;
  onOpen: () => void;
}

/** An account as a row: the bank's initial, its name, the bank and last 4 digits (and that cards and bills pull from it), and its balance; short of what it holds, the line says so while amounts are shown. */
function AccountRow({ account, unassignedCents, onOpen }: AccountRowProps) {
  const { isHidden } = useValuesHidden();
  const hasBalance = account.balanceCents !== null;
  const isShort = !isHidden && unassignedCents !== null && unassignedCents < 0;
  const bankLine = describeAccountLine(account);
  const detail = isShort
    ? ACCOUNT_WORDS.shortOfWhatItHolds(formatCents(-unassignedCents))
    : account.isPullAccount
      ? `${bankLine} · ${ACCOUNT_WORDS.pulledFrom}`
      : bankLine;
  return (
    <ItemRow
      name={account.name}
      leading={<ItemBadge name={account.institution} emoji={null} />}
      detail={detail}
      isDetailWarning={isShort}
      isDetailInked={isShort}
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
