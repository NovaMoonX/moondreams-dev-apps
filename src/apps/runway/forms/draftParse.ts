import {
  CALENDAR_PERIODS,
  STANCE_FOLLOW_PLAN,
  STANCES,
} from '@apps/runway/constants';
import type { FundingFormData } from '@apps/runway/forms/fundingFlow';
import type { AmountDraft } from '@apps/runway/utils/rangeInput';

type Check = (value: unknown) => boolean;

export const isText: Check = (value) => typeof value === 'string';
export const isNullableText: Check = (value) =>
  value === null || typeof value === 'string';
export const isFlag: Check = (value) => typeof value === 'boolean';
export const isWholeNumber: Check = (value) => Number.isInteger(value);
export const isTextList: Check = (value) =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export const isOneOf =
  (options: readonly string[]): Check =>
  (value) =>
    typeof value === 'string' && options.includes(value);
export const isNullableOneOf =
  (options: readonly string[]): Check =>
  (value) =>
    value === null || isOneOf(options)(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a kept draft back as `T`, or null unless it has exactly the checked keys with values that pass their checks. */
export function readDraftFields<T extends object>(
  stored: unknown,
  checks: { [K in keyof T]-?: Check },
): T | null {
  if (!isRecord(stored)) return null;
  const keys = Object.keys(checks) as (keyof T & string)[];
  if (Object.keys(stored).length !== keys.length) return null;
  if (!keys.every((key) => checks[key](stored[key]))) return null;
  return Object.fromEntries(keys.map((key) => [key, stored[key]])) as T;
}

export const isAmountDraft: Check = (value) =>
  readDraftFields<AmountDraft>(value, {
    mode: isOneOf(['exact', 'range']),
    low: isText,
    high: isText,
    stance: isOneOf([STANCE_FOLLOW_PLAN, ...STANCES]),
  }) !== null;

/** `{ choice, newText }` of a PickOrCreate. */
export const isPickOrCreate: Check = (value) =>
  readDraftFields<{ choice: string; newText: string }>(value, {
    choice: isText,
    newText: isText,
  }) !== null;

/** The checks for the funding questions an envelope's and a goal's form share. */
export const fundingFieldChecks: { [K in keyof FundingFormData]-?: Check } = {
  often: isOneOf([...CALENDAR_PERIODS, 'paycheck', 'none']),
  amount: isText,
  mode: isOneOf(['exact', 'range', 'percent', 'rest']),
  cadence: isOneOf(['everyIncomeDay', 'every2', 'every3', 'chosen']),
  dayKeys: isTextList,
  sourceId: isNullableText,
};
