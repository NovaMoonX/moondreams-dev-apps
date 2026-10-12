import { MAX_COPIED_INGREDIENTS } from '@apps/pinch/constants';
import type { ResolvedFamily, ResolvedIngredient } from '@apps/pinch/types';
import { escapeMarkdown } from '@apps/pinch/utils/markdown/escape';

/** The person's ingredients (the ones they made, adjusted, priced or use in a recipe) as names grouped by family, with "and N more" past the cap. Never prices, stores, products or nutrition. */
export function ingredientsMarkdown(
  ingredients: ResolvedIngredient[],
  families: ResolvedFamily[],
  isMine: (ingredient: ResolvedIngredient) => boolean,
): string {
  const mine = ingredients.filter(isMine);
  const copied = mine.slice(0, MAX_COPIED_INGREDIENTS);
  const familyName = new Map(
    families.map((family) => [family.id, family.name]),
  );
  const groups = copied.reduce((byFamily, ingredient) => {
    const name = familyName.get(ingredient.familyId ?? '') ?? 'Other';
    byFamily.set(name, [...(byFamily.get(name) ?? []), ingredient.name]);
    return byFamily;
  }, new Map<string, string[]>());
  const more = mine.length - copied.length;

  return [
    '# My ingredients',
    mine.length === 0 ? 'Nothing here yet.' : null,
    ...[...groups].map(
      ([name, names]) =>
        `## ${escapeMarkdown(name)}\n${names.map((entry) => `- ${escapeMarkdown(entry)}`).join('\n')}`,
    ),
    more > 0 ? `…and ${more} more` : null,
  ]
    .filter((block): block is string => block !== null)
    .join('\n\n');
}
