import { weakMapMemoize } from '@reduxjs/toolkit';

import {
  UNIT_DIMENSION,
  UNIT_LABELS,
  UNIT_TO_BASE,
} from '@apps/pinch/constants';
import type {
  Gap,
  PlannedMeal,
  Recipe,
  ResolvedIngredient,
  Unit,
} from '@apps/pinch/types';
import { bridge, toBase } from '@apps/pinch/utils/quantity';
import { getItemsLines } from '@apps/pinch/utils/shopping';

/** A piece with no weight of its own counts as this many grams when gaps are ranked. */
const GRAMS_PER_UNWEIGHED_PIECE = 50;

interface Amount {
  amount: number;
  unit: Unit;
  grams: number;
}

/** Where an ingredient is used: the recipes that name it (heaviest first) and what the plan ahead needs of it. */
export interface IngredientUse {
  recipes: (Amount & { title: string })[];
  planned: Amount[];
  /** A rough weight across the recipes and the plan, for ranking only. */
  grams: number;
}

const estimateGrams = (
  amount: number,
  unit: Unit,
  ingredient: ResolvedIngredient | undefined,
) => {
  const base = toBase(amount, unit);
  const mass = bridge(base, 'MASS', {
    gramsPerMl: ingredient?.gramsPerMl ?? null,
    gramsEach: ingredient?.gramsEach ?? null,
  });
  if (mass) return mass.value;
  return base.dimension === 'COUNT'
    ? base.value * GRAMS_PER_UNWEIGHED_PIECE
    : base.value;
};

const byGrams = (a: { grams: number }, b: { grams: number }) =>
  b.grams - a.grams;

function buildIngredientUses(
  recipes: Recipe[],
  plannedMeals: PlannedMeal[],
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, ResolvedIngredient>,
): Map<string, IngredientUse> {
  const useOf = (uses: Map<string, IngredientUse>, id: string) => {
    const known = uses.get(id);
    if (known) return known;
    const created: IngredientUse = { recipes: [], planned: [], grams: 0 };
    uses.set(id, created);
    return created;
  };
  const fromRecipes = recipes
    .filter((recipe) => recipe.isArchived !== true)
    .reduce((uses, recipe) => {
      recipe.ingredients.forEach((line) => {
        const use = useOf(uses, line.ingredientId);
        const grams = estimateGrams(
          line.amount,
          line.unit,
          ingredientsById.get(line.ingredientId),
        );
        use.recipes.push({
          title: recipe.title,
          amount: line.amount,
          unit: line.unit,
          grams,
        });
        use.grams += grams;
      });
      return uses;
    }, new Map<string, IngredientUse>());

  const withPlans = plannedMeals
    .filter((meal) => meal.snapshot === null)
    .flatMap((meal) => getItemsLines(meal.items, recipesById, ingredientsById))
    .reduce((uses, line) => {
      const use = useOf(uses, line.ingredientId);
      const grams = estimateGrams(
        line.amount,
        line.unit,
        ingredientsById.get(line.ingredientId),
      );
      const known = use.planned.find((entry) => entry.unit === line.unit);
      if (known) {
        known.amount += line.amount;
        known.grams += grams;
      } else {
        use.planned.push({ amount: line.amount, unit: line.unit, grams });
      }
      use.grams += grams;
      return uses;
    }, fromRecipes);

  withPlans.forEach((use) => {
    use.recipes.sort(byGrams);
    use.planned.sort(byGrams);
  });
  return withPlans;
}

/** Every ingredient's uses in the listed recipes and in the meals planned on days that haven't passed, built once per change of its inputs. */
export const getIngredientUses = weakMapMemoize(buildIngredientUses);

/** The gaps once each, the ingredient that weighs most in the recipes and the plan first. */
export function rankGaps(gaps: Gap[], uses: Map<string, IngredientUse>) {
  const unique = [
    ...new Map(
      gaps.map((gap) => [`${gap.kind}:${gap.ingredientId}`, gap]),
    ).values(),
  ];
  const weight = (gap: Gap) => uses.get(gap.ingredientId)?.grams ?? 0;
  const result = unique
    .map((gap, index) => ({ gap, index }))
    .sort((a, b) => weight(b.gap) - weight(a.gap) || a.index - b.index)
    .map((entry) => entry.gap);

  return result;
}

const formatAmount = ({ amount, unit }: Pick<Amount, 'amount' | 'unit'>) => {
  const digits = amount >= 10 ? 0 : amount >= 1 ? 1 : 2;
  const rounded = Number(amount.toFixed(digits));
  return `${rounded} ${UNIT_LABELS[unit]}`;
};

/** The plan's need in the unit of its biggest line; null when its units can't be added up. */
const getPlannedTotal = (
  planned: Amount[],
  ingredient: ResolvedIngredient | undefined,
) => {
  if (planned.length === 0) return null;
  const unit = planned[0].unit;
  const values = planned.map((entry) =>
    bridge(toBase(entry.amount, entry.unit), UNIT_DIMENSION[unit], {
      gramsPerMl: ingredient?.gramsPerMl ?? null,
      gramsEach: ingredient?.gramsEach ?? null,
    }),
  );
  if (values.some((value) => value === null)) return null;
  const amount =
    values.reduce((sum, value) => sum + (value?.value ?? 0), 0) /
    UNIT_TO_BASE[unit];
  return { amount, unit };
};

/** "Used in Adobo chicken · 2 lb planned": where an ingredient is used and how much, for a row that asks about it. */
export function getUseText(
  use: IngredientUse | undefined,
  ingredient: ResolvedIngredient | undefined,
): string | null {
  if (!use) return null;
  const titles = [...new Set(use.recipes.map((entry) => entry.title))];
  const planned = getPlannedTotal(use.planned, ingredient);
  const getWhere = () => {
    if (titles.length === 0) return null;
    const more = titles.length - 1;
    return more === 0
      ? `Used in ${titles[0]}`
      : `Used in ${titles[0]} and ${more} more`;
  };
  const getHowMuch = () => {
    if (planned) return `${formatAmount(planned)} planned`;
    if (titles.length === 1 && use.recipes.length === 1) {
      return formatAmount(use.recipes[0]);
    }
    return null;
  };

  const result = [getWhere(), getHowMuch()].filter(Boolean).join(' · ');
  return result === '' ? null : result;
}

const PACKAGE_UNITS: Record<Unit, Unit> = {
  G: 'G',
  KG: 'KG',
  OZ: 'OZ',
  LB: 'LB',
  ML: 'ML',
  L: 'L',
  TSP: 'FL_OZ',
  TBSP: 'FL_OZ',
  CUP: 'FL_OZ',
  FL_OZ: 'FL_OZ',
  PINCH: 'FL_OZ',
  EACH: 'EACH',
};

/** The unit a package of it is likely sold in, from how the recipes and the plan measure it: lb for chicken in lb, fl oz for soy sauce in cups, each for garlic. */
export function getPackageUnit(
  use: IngredientUse | undefined,
  ingredient: ResolvedIngredient | undefined,
): Unit {
  const biggest = [...(use?.planned ?? []), ...(use?.recipes ?? [])].sort(
    byGrams,
  )[0];
  const unit = biggest?.unit ?? ingredient?.serving.unit ?? 'G';
  return PACKAGE_UNITS[unit];
}
