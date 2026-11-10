import { KEY_DATE_LABEL_MAX } from '@apps/helm/constants';
import type { KeyDateKind } from '@apps/helm/types';

export type KeyDateRefusal = 'monthAlone' | 'badDay' | 'badYear' | 'needsName';

export interface KeyDatePartsInput {
  kind: KeyDateKind;
  label: string | null;
  month: number;
  day: number | null;
  year: number | null;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The same checks the server makes on a date it files: a day or a year (never a month alone), a day that exists, a year in range for the kind, a name for a custom one. */
export function checkKeyDateParts(
  parts: KeyDatePartsInput,
  thisYear: number,
): KeyDateRefusal | null {
  const { kind, month, day, year } = parts;
  if (!Number.isInteger(month) || month < 1 || month > 12) return 'badDay';
  if (day === null && year === null) return 'monthAlone';
  if (day !== null) {
    if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
      return 'badDay';
    }
    if (month === 2 && day === 29 && year !== null && !isLeapYear(year)) {
      return 'badDay';
    }
  }
  if (year !== null) {
    const last = kind === 'birthday' ? thisYear : thisYear + 1;
    if (!Number.isInteger(year) || year < 1900 || year > last) return 'badYear';
  }
  const label = parts.label?.trim() ?? '';
  if (
    kind === 'custom' &&
    (label === '' || label.length > KEY_DATE_LABEL_MAX)
  ) {
    return 'needsName';
  }
  return null;
}
