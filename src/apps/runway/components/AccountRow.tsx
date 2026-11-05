import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { formatCents } from '@/utils/moneyUtils';
import ItemBadge from '@apps/runway/components/ItemBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useAccountInterest } from '@apps/runway/hooks/useAccountInterest';
import type { OpenAccount } from '@apps/runway/types';
import { describeAccountLine } from '@apps/runway/utils/accountText';

interface AccountRowProps {
  account: OpenAccount;
  unassignedCents: number | null;
  onOpen: () => void;
}

function AccountRow({ account, unassignedCents, onOpen }: AccountRowProps) {
  const { isHidden } = useValuesHidden();
  const { shown } = useAccountInterest(account, todayAsUtcDate(useNow(60_000)));
  const hasBalance = account.balanceCents !== null;
  const isShort = !isHidden && unassignedCents !== null && unassignedCents < 0;
  const bankLine = describeAccountLine(account);
  const detail = isShort
    ? ACCOUNT_WORDS.rowShort(bankLine, formatCents(-unassignedCents))
    : account.isPullAccount
      ? ACCOUNT_WORDS.rowPulledFrom(bankLine)
      : bankLine;
  return (
    <ItemRow
      name={account.name}
      leading={<ItemBadge name={account.institution} emoji={null} />}
      detail={detail}
      isDetailWarning={isShort}
      isDetailInked={isShort}
      figure={
        shown.cents === null
          ? ACCOUNT_WORDS.noBalance
          : formatCents(shown.cents)
      }
      isPrivate={hasBalance}
      isFigureMuted={!hasBalance}
      ariaLabel={`${account.name}. Open`}
      onOpen={onOpen}
    />
  );
}

export default AccountRow;
