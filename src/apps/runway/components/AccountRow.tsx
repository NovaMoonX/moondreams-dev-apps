import { useNow } from '@/hooks/useNow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import BankBadge from '@apps/runway/components/BankBadge';
import ItemRow from '@apps/runway/components/ItemRow';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import type { OpenAccount } from '@apps/runway/types';
import { describeAccountLine } from '@apps/runway/utils/accountText';
import { describeBankFacts } from '@apps/runway/utils/bankFreshness';

interface AccountRowProps {
  account: OpenAccount;
  unassignedCents: number | null;
  onOpen: () => void;
}

function AccountRow({ account, unassignedCents, onOpen }: AccountRowProps) {
  const { isHidden } = useValuesHidden();
  const hasBalance = account.balanceCents !== null;
  const isShort = !isHidden && unassignedCents !== null && unassignedCents < 0;
  const now = useNow(60_000);
  const bank = useAppSelector((state) =>
    account.linkId === null
      ? null
      : (state.runway.accountBalances.find(
          (entry) => entry.id === account.id,
        ) ?? null),
  );
  const bankFacts = bank === null ? null : describeBankFacts(bank, now);
  const bankLine = [describeAccountLine(account), bankFacts?.text]
    .filter(Boolean)
    .join(' · ');
  const detail = isShort
    ? ACCOUNT_WORDS.rowShort(bankLine, formatCents(-unassignedCents))
    : account.isPullAccount
      ? ACCOUNT_WORDS.rowPulledFrom(bankLine)
      : bankLine;
  return (
    <ItemRow
      name={account.name}
      leading={<BankBadge name={account.institution} linkId={account.linkId} />}
      detail={detail}
      isDetailWarning={isShort}
      isDetailInked={isShort}
      isDetailFresh={!isShort && (bankFacts?.isFresh ?? false)}
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
