import {
  MAX_CARE_DAYS,
  MAX_CARE_REHEAT_LENGTH,
  MAX_CARE_TIP_LENGTH,
} from '@apps/pinch/constants';
import type { Recipe, RecipeCare } from '@apps/pinch/types';

/** The four parts of a recipe's care as the form holds them while the person types. */
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

/** Cleans whatever it is given into a care record: a part that isn't usable becomes null, and a record with nothing in it is null. */
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

/** A recipe written before care existed has no key, which reads as no care. */
export const getRecipeCare = (recipe: { care?: Recipe['care'] }) =>
  toCare(recipe.care);

/** "1 day", "5 days", "2 weeks", "3 months": the largest of weeks and months that fits the days exactly. */
export const formatCareDays = (days: number) => {
  if (days >= 30 && days % 30 === 0) {
    const months = days / 30;
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  if (days >= 7 && days % 7 === 0) {
    const weeks = days / 7;
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

/** What was typed as a care record; days that aren't whole numbers from 1 to the cap are left out here and named by `getCareProblem`. */
export const parseCareText = (text: CareText) =>
  toCare({
    fridgeDays: parseDays(text.fridge),
    freezerDays: parseDays(text.freezer),
    reheat: text.reheat,
    tip: text.tip,
  });

/** What stops the typed care from being saved, in a few plain words, or null. */
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

/** The form row's summary as a short phrase, "Fridge 3 days, freezer 3 months, reheating, tip", or empty; days that can't be used show as typed, so the row never claims there is nothing while it names a problem. Commas, not dots, so a wrap never leaves a separator at the end of a line. */
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

/** "Leftovers keep 3 days in the fridge, 3 months in the freezer", or null when the recipe names neither. */
export const getLeftoversLine = (care: RecipeCare | null) => {
  const parts = [
    care?.fridgeDays != null &&
      `${formatCareDays(care.fridgeDays)} in the fridge`,
    care?.freezerDays != null &&
      `${formatCareDays(care.freezerDays)} in the freezer`,
  ].filter((part) => part !== false);

  return parts.length === 0 ? null : `Leftovers keep ${parts.join(', ')}`;
};
