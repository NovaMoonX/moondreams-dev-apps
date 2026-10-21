import { UNIT_LABELS } from '@apps/pinch/constants';
import type { Recipe, ResolvedIngredient } from '@apps/pinch/types';
import { escapeMarkdown } from '@apps/pinch/utils/markdown/escape';
import { formatMinutes } from '@apps/pinch/utils/recipeFormat';

const round = (value: number) => Math.round(value * 100) / 100;

/** "2 lb Chicken thigh (diced)": amount, unit, name and the line's note. */
export function formatIngredientLine(
  line: Recipe['ingredients'][number],
  ingredientsById: Map<string, ResolvedIngredient>,
) {
  const name = escapeMarkdown(
    ingredientsById.get(line.ingredientId)?.name ?? 'Removed ingredient',
  );
  const note = line.note ? ` (${escapeMarkdown(line.note)})` : '';

  return `${round(line.amount)} ${UNIT_LABELS[line.unit]} ${name}${note}`;
}

/** A recipe as Markdown for a chat: title, servings, times, ingredients with amounts and steps. Prices, stores, products, nutrition and the cover never appear. */
export function recipeMarkdown(
  recipe: Recipe,
  ingredientsById: Map<string, ResolvedIngredient>,
): string {
  const facts = [
    `Serves ${round(recipe.servings)}`,
    recipe.prepMinutes != null && `Prep ${formatMinutes(recipe.prepMinutes)}`,
    recipe.cookMinutes != null && `Cook ${formatMinutes(recipe.cookMinutes)}`,
  ].filter(Boolean);

  return [
    `# ${escapeMarkdown(recipe.title)}`,
    facts.join(' · '),
    recipe.description ? escapeMarkdown(recipe.description) : null,
    '## Ingredients',
    recipe.ingredients
      .map((line) => `- ${formatIngredientLine(line, ingredientsById)}`)
      .join('\n'),
    recipe.steps.length > 0 ? '## Steps' : null,
    recipe.steps
      .map((step, index) => `${index + 1}. ${escapeMarkdown(step)}`)
      .join('\n') || null,
  ]
    .filter((block): block is string => block !== null && block !== '')
    .join('\n\n');
}
