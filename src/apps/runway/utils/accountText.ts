import { ACCOUNT_WORDS } from '@apps/runway/constants';
import type { DateOnly, OpenAccount } from '@apps/runway/types';

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: 'UTC',
});

const toDayOrdinal = (day: number) => {
  const tail = day % 100;
  const suffix =
    tail >= 11 && tail <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ??
        'th');
  return `${day}${suffix}`;
};

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
