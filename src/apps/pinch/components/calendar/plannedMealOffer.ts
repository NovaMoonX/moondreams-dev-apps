import { CONTAINER_PLACES } from '@apps/pinch/constants';
import type { Container, ContainerPlace, MealItem } from '@apps/pinch/types';
import { getDaysLeft } from '@apps/pinch/utils/containers';
import { getCookId } from '@apps/pinch/utils/cooks';
import { DAY_MS, getLocalTodayDate } from '@apps/pinch/utils/dayKeys';

type PlateItem = Pick<MealItem, 'kind' | 'refId' | 'servings'>;

export type PlannedMealPhase = 'AHEAD' | 'TODAY' | 'PAST';

export type PlannedMealPrimary =
  { kind: 'COOK' } | { kind: 'EAT'; place: ContainerPlace } | null;

export type PlannedMealAction =
  | { kind: 'COOK' }
  | { kind: 'EAT'; place: ContainerPlace; count: number }
  | { kind: 'SAVE' };

/** `from` on an eat view is where its Back returns. */
export type PlannedMealSubview =
  | { kind: 'meal' }
  | { kind: 'more' }
  | { kind: 'name' }
  | { kind: 'eat'; place: ContainerPlace; from: 'meal' | 'more' };

export const PLANNED_MEAL_VIEW: PlannedMealSubview = { kind: 'meal' };

export interface PlannedMealOfferInput {
  meal: { id: string; date: number; items: PlateItem[] };
  /** Recipes on the plate that still exist, in plate order. */
  recipeIds: string[];
  /** Of those, the ones with steps to cook from. */
  cookableRecipeIds: string[];
  cookIds: { has: (id: string) => boolean };
  /** In-stock containers that match the meal's recipes or its saved meal. */
  containers: Container[];
  savedPlates: PlateItem[][];
  now: number;
}

export interface PlannedMealOffer {
  phase: PlannedMealPhase;
  primary: PlannedMealPrimary;
  /** Cookable recipes not yet cooked for this meal. */
  cookRecipeIds: string[];
  canMarkCooked: boolean;
  /** The containers it may offer to eat from, soonest eat-by first. */
  eatFrom: Container[];
  canSaveAsMeal: boolean;
  /** What "More" offers beside taking the meal off its day, in order, never what the primary already does. */
  more: PlannedMealAction[];
}

const getPhase = (date: number, today: number): PlannedMealPhase => {
  if (date > today) return 'AHEAD';
  return date === today ? 'TODAY' : 'PAST';
};

const getPlateKey = (items: PlateItem[]) =>
  items
    .map((item) => `${item.kind}:${item.refId}:${item.servings}`)
    .sort()
    .join('|');

/** Recipes of a planned meal that have the cook its own mark writes. */
export const getCookedRecipeIds = (
  mealId: string,
  recipeIds: string[],
  cookIds: { has: (id: string) => boolean },
) => recipeIds.filter((recipeId) => cookIds.has(getCookId(mealId, recipeId)));

/** Cooked means every recipe on the plate has its cook, and never on a day still ahead. */
export const isPlannedMealCooked = (
  meal: { id: string; date: number },
  recipeIds: string[],
  cookIds: { has: (id: string) => boolean },
  now = Date.now(),
) =>
  meal.date <= getLocalTodayDate(now) &&
  recipeIds.length > 0 &&
  getCookedRecipeIds(meal.id, recipeIds, cookIds).length === recipeIds.length;

/** What a planned meal offers in its phase: one primary, the other actions that still make sense, and whether its plate is worth saving. */
export function getPlannedMealOffer({
  meal,
  recipeIds,
  cookableRecipeIds,
  cookIds,
  containers,
  savedPlates,
  now,
}: PlannedMealOfferInput): PlannedMealOffer {
  const today = getLocalTodayDate(now);
  const phase = getPhase(meal.date, today);
  const cooked = new Set(getCookedRecipeIds(meal.id, recipeIds, cookIds));
  const ownCookIds = new Set(
    recipeIds.map((recipeId) => getCookId(meal.id, recipeId)),
  );
  const isEatDay = meal.date === today || meal.date === today - DAY_MS;
  const eatFrom = isEatDay
    ? containers.filter(
        (container) =>
          !(container.cookId !== null && ownCookIds.has(container.cookId)) &&
          !(container.recipeId !== null && cooked.has(container.recipeId)) &&
          !(container.mealId !== null && cooked.size > 0),
      )
    : [];
  const cookRecipeIds =
    phase === 'PAST'
      ? []
      : cookableRecipeIds.filter((recipeId) => !cooked.has(recipeId));
  const plateKey = getPlateKey(meal.items);
  const canSaveAsMeal =
    meal.items.length > 1 &&
    !savedPlates.some((plate) => getPlateKey(plate) === plateKey);

  const getPrimary = (): PlannedMealPrimary => {
    if (phase !== 'TODAY') return null;
    const due = eatFrom.filter((container) => {
      const days = getDaysLeft(container.eatBy, now);
      return days >= 0 && days <= 1;
    });
    if (cooked.size === 0 && due.length > 0) {
      const place = due.some((container) => container.place === 'FRIDGE')
        ? 'FRIDGE'
        : 'FREEZER';
      return { kind: 'EAT', place };
    }
    return cookRecipeIds.length > 0 ? { kind: 'COOK' } : null;
  };

  const primary = getPrimary();
  const eatActions = CONTAINER_PLACES.map((place) => ({
    kind: 'EAT' as const,
    place,
    count: eatFrom.filter((container) => container.place === place).length,
  })).filter(
    (action) =>
      action.count > 0 &&
      !(primary?.kind === 'EAT' && primary.place === action.place),
  );
  const more: PlannedMealAction[] = [
    ...(cookRecipeIds.length > 0 && primary?.kind !== 'COOK'
      ? [{ kind: 'COOK' as const }]
      : []),
    ...eatActions,
    ...(canSaveAsMeal ? [{ kind: 'SAVE' as const }] : []),
  ];

  const result: PlannedMealOffer = {
    phase,
    primary,
    cookRecipeIds,
    canMarkCooked: phase !== 'AHEAD',
    eatFrom,
    canSaveAsMeal,
    more,
  };

  return result;
}
