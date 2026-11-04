import { formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { ACCOUNT_KIND_LABELS, ACCOUNT_WORDS } from '@apps/runway/constants';
import { toDayOrdinal } from '@apps/runway/utils/monthDays';
import type {
  AccountSealed,
  Cents,
  DateOnly,
  OpenAccount,
} from '@apps/runway/types';

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
});

/** A date-only day with an ordinal and a short month: "Nov 4th", with the year when it is not this one. */
export function formatDayOrdinalUTC(on: DateOnly) {
  const date = new Date(on);
  const base = `${monthFormatter.format(date)} ${toDayOrdinal(date.getUTCDate())}`;
  return date.getUTCFullYear() === new Date().getUTCFullYear()
    ? base
    : `${base}, ${date.getUTCFullYear()}`;
}

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
) => ACCOUNT_WORDS.changeBalance(name, formatCents(cents), formatDateUTC(on));
