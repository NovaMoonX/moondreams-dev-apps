import { formatDateOrdinalUTC, toDayOrdinal } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { ACCOUNT_KIND_LABELS, ACCOUNT_WORDS } from '@apps/runway/constants';
import type {
  AccountSealed,
  Cents,
  DateOnly,
  OpenAccount,
} from '@apps/runway/types';

export const isLastFour = (text: string) => /^\d{4}$/.test(text);

/** The bank, then the last 4 digits when given: "Capital One ••1234". */
export const describeAccountLine = (
  account: Pick<OpenAccount, 'institution' | 'lastFour'>,
) =>
  account.lastFour
    ? ACCOUNT_WORDS.withLastFour(account.institution, account.lastFour)
    : account.institution;

const lastFourOf = (account: Pick<AccountSealed, 'lastFour'>) =>
  account.lastFour ? `••${account.lastFour}` : ACCOUNT_WORDS.changeNoLastFour;
/** An APY in basis points as the percent a bank prints, two decimals ("4.10"). */
export const formatApy = (bps: number) => (bps / 100).toFixed(2);

const describeApy = (bps: number | null) =>
  bps === null
    ? ACCOUNT_WORDS.changeNoApy
    : ACCOUNT_WORDS.apyValue(formatApy(bps));
const describeInterestDay = (day: number | null) =>
  day === null
    ? ACCOUNT_WORDS.changeInterestLastDay
    : `the ${toDayOrdinal(day)}`;
const yesNo = (value: boolean) =>
  value ? ACCOUNT_WORDS.changeYes : ACCOUNT_WORDS.changeNo;

/** The change-log sentence for an account edited: only what differs, from and to; null when nothing does. */
export function describeAccountChanged(
  before: AccountSealed,
  after: AccountSealed,
): string | null {
  const parts = [
    before.name === after.name
      ? null
      : ACCOUNT_WORDS.changeName(before.name, after.name),
    before.institution === after.institution
      ? null
      : ACCOUNT_WORDS.changeBank(before.institution, after.institution),
    before.kind === after.kind
      ? null
      : ACCOUNT_WORDS.changeKind(
          ACCOUNT_KIND_LABELS[before.kind],
          ACCOUNT_KIND_LABELS[after.kind],
        ),
    (before.lastFour ?? null) === (after.lastFour ?? null)
      ? null
      : ACCOUNT_WORDS.changeLastFour(lastFourOf(before), lastFourOf(after)),
    before.isPullAccount === after.isPullAccount
      ? null
      : ACCOUNT_WORDS.changePull(
          yesNo(before.isPullAccount),
          yesNo(after.isPullAccount),
        ),
    (before.apyBps ?? null) === (after.apyBps ?? null)
      ? null
      : ACCOUNT_WORDS.changeApy(
          describeApy(before.apyBps ?? null),
          describeApy(after.apyBps ?? null),
        ),
    (before.interestDay ?? null) === (after.interestDay ?? null)
      ? null
      : ACCOUNT_WORDS.changeInterestDay(
          describeInterestDay(before.interestDay ?? null),
          describeInterestDay(after.interestDay ?? null),
        ),
  ].filter((part) => part !== null);
  return parts.length === 0
    ? null
    : ACCOUNT_WORDS.changeChanged(before.name, parts.join('; '));
}

/** The change-log sentence for a balance recorded: "Checking B balance $650.00 on Nov 4". */
export const describeAccountBalance = (
  name: string,
  cents: Cents,
  on: DateOnly,
) =>
  ACCOUNT_WORDS.changeBalance(
    name,
    formatCents(cents),
    formatDateOrdinalUTC(on),
  );

/** The name an account goes by in a sentence: its name, with the last 4 digits when another open account shares its bank. */
export const getAccountMoveName = (
  account: Pick<OpenAccount, 'id' | 'name' | 'institution' | 'lastFour'>,
  accounts: readonly Pick<OpenAccount, 'id' | 'institution'>[],
) => {
  const isShared = accounts.some(
    (other) =>
      other.id !== account.id &&
      other.institution.trim().toLowerCase() ===
        account.institution.trim().toLowerCase(),
  );
  return isShared && account.lastFour
    ? `${account.name}\u00a0••${account.lastFour}`
    : account.name;
};
