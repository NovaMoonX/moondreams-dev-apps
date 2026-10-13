import {
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
} from '@apps/pinch/constants';
import type {
  MealItem,
  PlannedMeal,
  Recipe,
  ResolvedIngredient,
} from '@apps/pinch/types';
import {
  addDaysToKey,
  formatDayTitle,
  getWeekStartKey,
} from '@apps/pinch/utils/dayKeys';
import { escapeMarkdown } from '@apps/pinch/utils/markdown/escape';
import { formatIngredientLine } from '@apps/pinch/utils/markdown/recipeMarkdown';
import { getItemTitle } from '@apps/pinch/utils/mealFormat';
import { formatServings } from '@apps/pinch/utils/recipeFormat';

export interface MarkdownLookups {
  recipesById: Map<string, Recipe>;
  ingredientsById: Map<string, ResolvedIngredient>;
}

/** A plate's items as bullets with the servings, and a recipe's ingredients nested under it. */
export function itemsMarkdown(
  items: MealItem[],
  { recipesById, ingredientsById }: MarkdownLookups,
): string {
  return items
    .flatMap((item) => {
      const recipe =
        item.kind === 'RECIPE' ? recipesById.get(item.refId) : undefined;
      return [
        `- ${escapeMarkdown(getItemTitle(item, recipesById, ingredientsById))} (${formatServings(item.servings)})`,
        ...(recipe?.ingredients.map(
          (line) => `  - ${formatIngredientLine(line, ingredientsById)}`,
        ) ?? []),
      ];
    })
    .join('\n');
}

/** A saved meal as Markdown. */
export const mealMarkdown = (
  name: string,
  items: MealItem[],
  lookups: MarkdownLookups,
) => `# ${escapeMarkdown(name)}\n\n${itemsMarkdown(items, lookups)}`;

const dayBlock = (
  dayKey: string,
  meals: PlannedMeal[],
  lookups: MarkdownLookups,
  level: '#' | '##',
) => {
  const body = MEAL_TYPES.flatMap((type) => {
    const ofType = meals.filter((meal) => meal.mealType === type);
    return ofType.length === 0
      ? []
      : [
          `${level}# ${MEAL_TYPE_EMOJIS[type]} ${MEAL_TYPE_LABELS[type]}`,
          ...ofType.map((meal) => itemsMarkdown(meal.items, lookups)),
        ];
  });

  return [
    `${level} ${formatDayTitle(dayKey)}`,
    body.length === 0 ? 'Nothing planned.' : body.join('\n\n'),
  ].join('\n\n');
};

/** One planned day: each meal type under its heading with its items. No prices or stores. */
export const dayMarkdown = (
  dayKey: string,
  meals: PlannedMeal[],
  lookups: MarkdownLookups,
) => dayBlock(dayKey, meals, lookups, '#');

/** The Monday-to-Sunday week that holds `dayKey`, seven day blocks in the same shape as a day. */
export function weekMarkdown(
  dayKey: string,
  mealsByDay: Map<string, PlannedMeal[]>,
  lookups: MarkdownLookups,
): string {
  const monday = getWeekStartKey(dayKey);
  const days = Array.from({ length: 7 }, (_, offset) =>
    addDaysToKey(monday, offset),
  );

  return [
    `# Week of ${formatDayTitle(monday)} to ${formatDayTitle(days[6])}`,
    ...days.map((key) =>
      dayBlock(key, mealsByDay.get(key) ?? [], lookups, '##'),
    ),
  ].join('\n\n');
}
