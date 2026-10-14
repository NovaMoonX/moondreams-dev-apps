import { MAX_SOURCE_LABEL_LENGTH } from '@apps/pinch/constants';
import type { Recipe, Source } from '@apps/pinch/types';

const stripWww = (host: string) => host.replace(/^www\./i, '');

/** Labels are compared ignoring case and surrounding space: "serious eats " and "Serious Eats" are one source. */
export const normalizeSourceLabel = (label: string) =>
  label.trim().toLowerCase();

export const findSourceByLabel = (
  sources: Source[],
  label: string,
  exceptId: string | null = null,
) => {
  const wanted = normalizeSourceLabel(label);
  const result =
    sources.find(
      (source) =>
        source.id !== exceptId && normalizeSourceLabel(source.label) === wanted,
    ) ?? null;

  return result;
};

/** The source a recipe names, or null when it names none, lacks the key (a recipe from before sources) or names one that is gone. */
export const getRecipeSource = (
  recipe: Pick<Recipe, 'sourceId'>,
  sourcesById: Map<string, Source>,
) => sourcesById.get(recipe.sourceId ?? '') ?? null;

/** What a recipe read from a link starts with: the source already named for the site (with or without its "www."), else a new label made from the host. */
export const getHostSource = (host: string, sources: Source[]) => {
  const label = stripWww(host).slice(0, MAX_SOURCE_LABEL_LENGTH);
  const wanted = normalizeSourceLabel(label);
  const existing =
    sources.find(
      (source) => normalizeSourceLabel(stripWww(source.label)) === wanted,
    ) ?? null;

  return { existing, label };
};
