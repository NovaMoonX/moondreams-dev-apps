import {
  CARE_DAYS_PER_MONTH,
  CARE_DAYS_PER_WEEK,
  MAX_CARE_DAYS,
  MAX_CARE_REHEAT_LENGTH,
  MAX_CARE_TIP_LENGTH,
} from '@apps/pinch/constants';
import type { Recipe, RecipeCare } from '@apps/pinch/types';

export interface CareText {
  fridge: string;
  freezer: string;
  reheat: string;
  tip: string;
}

export const EMPTY_CARE_TEXT: CareText = {
  fridge: '',
  freezer: '',
  reheat: '',
  tip: '',
};

const asDays = (value: unknown) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= MAX_CARE_DAYS
    ? value
    : null;

const asText = (value: unknown, max: number) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : text.slice(0, max);
};

export const toCare = (
  parts: Partial<Record<keyof RecipeCare, unknown>> | null | undefined,
): RecipeCare | null => {
  const care: RecipeCare = {
    fridgeDays: asDays(parts?.fridgeDays),
    freezerDays: asDays(parts?.freezerDays),
    reheat: asText(parts?.reheat, MAX_CARE_REHEAT_LENGTH),
    tip: asText(parts?.tip, MAX_CARE_TIP_LENGTH),
  };
  const result = Object.values(care).every((part) => part === null)
    ? null
    : care;

  return result;
};

export const getRecipeCare = (recipe: { care?: Recipe['care'] }) =>
  toCare(recipe.care);

export const formatCareDays = (days: number) => {
  if (days >= CARE_DAYS_PER_MONTH && days % CARE_DAYS_PER_MONTH === 0) {
    const months = days / CARE_DAYS_PER_MONTH;
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  if (days >= CARE_DAYS_PER_WEEK && days % CARE_DAYS_PER_WEEK === 0) {
    const weeks = days / CARE_DAYS_PER_WEEK;
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  return `${days} ${days === 1 ? 'day' : 'days'}`;
};

export const getCareText = (care: RecipeCare | null): CareText => ({
  fridge: care?.fridgeDays != null ? String(care.fridgeDays) : '',
  freezer: care?.freezerDays != null ? String(care.freezerDays) : '',
  reheat: care?.reheat ?? '',
  tip: care?.tip ?? '',
});

const parseDays = (text: string) =>
  /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;

const isDaysText = (text: string) =>
  text.trim() === '' || asDays(parseDays(text)) !== null;

export const parseCareText = (text: CareText) =>
  toCare({
    fridgeDays: parseDays(text.fridge),
    freezerDays: parseDays(text.freezer),
    reheat: text.reheat,
    tip: text.tip,
  });

export const getCareProblem = (text: CareText) => {
  const badDays = [
    !isDaysText(text.fridge) && 'fridge',
    !isDaysText(text.freezer) && 'freezer',
  ].filter((part) => part !== false);
  if (badDays.length > 0) {
    return `Use whole days from 1 to ${MAX_CARE_DAYS} for the ${badDays.join(' and ')}`;
  }
  if (text.reheat.trim().length > MAX_CARE_REHEAT_LENGTH) {
    return `Keep the reheating line to ${MAX_CARE_REHEAT_LENGTH} characters or fewer`;
  }
  if (text.tip.trim().length > MAX_CARE_TIP_LENGTH) {
    return `Keep the tip to ${MAX_CARE_TIP_LENGTH} characters or fewer`;
  }

  return null;
};

/** Commas, not dots, so a wrap never leaves a separator at the end of a line. */
export const getCareSummary = (text: CareText) => {
  const getDaysPart = (label: string, typed: string) => {
    const days = typed.trim();
    if (days === '') return false;
    return `${label} ${isDaysText(days) ? formatCareDays(Number(days)) : `${days} days`}`;
  };
  const parts = [
    getDaysPart('Fridge', text.fridge),
    getDaysPart('freezer', text.freezer),
    text.reheat.trim() !== '' && 'reheating',
    text.tip.trim() !== '' && 'tip',
  ].filter((part) => part !== false);
  const phrase = parts.join(', ');

  return phrase === ''
    ? phrase
    : phrase.charAt(0).toUpperCase() + phrase.slice(1);
};

export const getLeftoversLine = (care: RecipeCare | null) => {
  const parts = [
    care?.fridgeDays != null &&
      `${formatCareDays(care.fridgeDays)} in the fridge`,
    care?.freezerDays != null &&
      `${formatCareDays(care.freezerDays)} in the freezer`,
  ].filter((part) => part !== false);

  return parts.length === 0 ? null : `Leftovers keep ${parts.join(', ')}`;
};
