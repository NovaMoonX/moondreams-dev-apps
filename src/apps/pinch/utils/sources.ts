import { MAX_SOURCE_LABEL_LENGTH } from '@apps/pinch/constants';
import type { Recipe, Source } from '@apps/pinch/types';

const stripWww = (host: string) => host.replace(/^www\./i, '');

const normalizeSourceLabel = (label: string) => label.trim().toLowerCase();

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

export const getRecipeSource = (
  recipe: Pick<Recipe, 'sourceId'>,
  sourcesById: Map<string, Source>,
) => sourcesById.get(recipe.sourceId ?? '') ?? null;

export const getHostSource = (host: string, sources: Source[]) => {
  const label = stripWww(host).slice(0, MAX_SOURCE_LABEL_LENGTH);
  const wanted = normalizeSourceLabel(label);
  const existing =
    sources.find(
      (source) => normalizeSourceLabel(stripWww(source.label)) === wanted,
    ) ?? null;

  return { existing, label };
};
