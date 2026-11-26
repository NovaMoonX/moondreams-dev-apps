import { formatList } from '@/utils/formatUtils';
import type { ExtractedRecipe } from '@apps/pinch/utils/normalizeRecipe';

export interface ReadNotice {
  headline: string;
  details: string[];
  /** A quiet closing line under the details, only when finishing added something. */
  footer: string | null;
}

const SAYS_TIMES = /\b(?:prep|cook|times?|minutes?)\b/i;
const SAYS_KEEPING =
  /\b(?:keeps?|keeping|fridge|freezer|reheat\w*|storage|stored?)\b/i;

const toSentence = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;

export const FINISHING_OFF_LINE =
  'Want only what you gave it? Turn off Finish recipes like a cookbook in Settings.';

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
    | 'finished'
    | 'unread'
  >,
  usedPicks: { name: string; ingredientName: string }[],
): ReadNotice => {
  const isFinishedForThem =
    (recipe.isServingsEstimate && recipe.servings !== null) ||
    recipe.isTimeEstimate ||
    recipe.isCareEstimate ||
    recipe.finished.length > 0 ||
    usedPicks.length > 0;
  const isTimesSaid = recipe.finished.some((item) => SAYS_TIMES.test(item));
  const isKeepingSaid = recipe.finished.some((item) => SAYS_KEEPING.test(item));
  const details = [
    recipe.isServingsEstimate && recipe.servings !== null
      ? `We guessed ${recipe.servings} servings from the amounts, since the recipe didn’t say.`
      : null,
    recipe.isTimeEstimate && !isTimesSaid
      ? 'We estimated the prep and cook times, since the recipe didn’t give them.'
      : null,
    recipe.isCareEstimate && !isKeepingSaid
      ? 'We estimated how long it keeps and how to reheat it.'
      : null,
    ...recipe.finished.map(toSentence),
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
      : recipe.finished.length > 0
        ? 'Finished like a cookbook'
        : isFinishedForThem
          ? 'Filled in and finished for you'
          : 'Filled in from your recipe';
  return {
    headline,
    details,
    footer: recipe.finished.length > 0 ? FINISHING_OFF_LINE : null,
  };
};
