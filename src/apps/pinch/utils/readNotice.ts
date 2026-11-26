import { formatList } from '@/utils/formatUtils';
import type { ExtractedRecipe } from '@apps/pinch/utils/normalizeRecipe';

export interface ReadNotice {
  headline: string;
  details: string[];
}

/** Details shown directly under the headline up to this many; more fold behind a tap. */
export const MAX_DIRECT_NOTICE_DETAILS = 2;

/** The notice on a form a reading filled in: a headline that says how it went and one line per thing it did, none of which the headline repeats. */
export const getReadNotice = (
  recipe: Pick<
    ExtractedRecipe,
    | 'servings'
    | 'isServingsEstimate'
    | 'isTimeEstimate'
    | 'isCareEstimate'
    | 'guided'
    | 'unread'
  >,
  usedPicks: { name: string; ingredientName: string }[],
): ReadNotice => {
  const isFinishedForThem =
    (recipe.isServingsEstimate && recipe.servings !== null) ||
    recipe.isTimeEstimate ||
    recipe.isCareEstimate ||
    usedPicks.length > 0;
  const details = [
    recipe.isServingsEstimate && recipe.servings !== null
      ? `We guessed ${recipe.servings} servings from the amounts, since the recipe didn’t say.`
      : null,
    recipe.isTimeEstimate
      ? 'We estimated the prep and cook times, since the recipe didn’t give them.'
      : null,
    recipe.isCareEstimate
      ? 'We estimated how long it keeps and how to reheat it.'
      : null,
    recipe.guided.length > 0
      ? `Shaped to match your notes: ${formatList(recipe.guided)}.`
      : null,
    usedPicks.length > 0
      ? `Used your usual picks: ${formatList(
          usedPicks.map(
            (pick) => `${pick.ingredientName} for ${pick.name.toLowerCase()}`,
          ),
        )}.`
      : null,
    recipe.unread.length > 0
      ? `We couldn’t read: ${recipe.unread.join(', ')}.`
      : null,
  ].filter((detail) => detail !== null);
  const headline =
    recipe.guided.length > 0
      ? 'We followed your notes'
      : isFinishedForThem
        ? 'Filled in and finished for you'
        : 'Filled in from your recipe';
  return { headline, details };
};
