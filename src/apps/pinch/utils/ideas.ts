import { getComparableUrl, getWebLinkHost, toWebLink } from '@/utils/urlUtils';
import {
  MAX_IDEA_SITE_NAME_LENGTH,
  MAX_IDEA_TITLE_LENGTH,
  MAX_IDEA_URL_LENGTH,
} from '@apps/pinch/constants';
import type { Idea, RecipeStartMethod } from '@apps/pinch/types';
import type { ExtractedRecipe } from '@apps/pinch/utils/normalizeRecipe';

export const findIdeaByUrl = (
  ideas: Idea[],
  url: string,
  exceptId: string | null = null,
) => {
  const wanted = getComparableUrl(url);
  const result =
    wanted === null
      ? null
      : (ideas.find(
          (idea) =>
            idea.id !== exceptId &&
            idea.url != null &&
            getComparableUrl(idea.url) === wanted,
        ) ?? null);

  return result;
};

export const toIdeaUrl = (text: string) => {
  const link = toWebLink(text);
  const result =
    link !== null && link.length <= MAX_IDEA_URL_LENGTH ? link : null;
  return result;
};

export const toIdeaImageUrl = (address: string | null | undefined) => {
  const link = address ? toWebLink(address) : null;
  const result =
    link !== null &&
    link.startsWith('https://') &&
    link.length <= MAX_IDEA_URL_LENGTH
      ? link
      : null;
  return result;
};

export const clipIdeaTitle = (title: string) =>
  title.trim().slice(0, MAX_IDEA_TITLE_LENGTH);

export const getIdeaSiteName = (idea: Pick<Idea, 'siteName' | 'url'>) =>
  idea.siteName ?? (idea.url ? getWebLinkHost(idea.url) : null);

export const clipSiteName = (name: string | null | undefined) =>
  name?.trim().slice(0, MAX_IDEA_SITE_NAME_LENGTH) || null;

export const getIdeaDetail = (idea: Idea) => {
  const site = idea.kind === 'LINK' ? getIdeaSiteName(idea) : null;
  const firstLine =
    (idea.note ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? null;
  const title = idea.title.trim().toLowerCase();

  return (
    [site, firstLine].find(
      (line) => line !== null && line.trim().toLowerCase() !== title,
    ) ?? null
  );
};

export const getIdeaSearchText = (idea: Idea) =>
  [idea.title, getIdeaSiteName(idea), idea.note].filter(Boolean).join(' ');

const IDEA_KEYS = [
  'note',
  'url',
  'siteName',
  'imageUrl',
  'photoPath',
  'recipeId',
] as const;

export const getMissingIdeaFields = (existing: object) =>
  Object.fromEntries(
    IDEA_KEYS.filter((key) => !(key in existing)).map((key) => [key, null]),
  );

export const getIdeaRecipeMethod = (
  idea: Pick<Idea, 'kind' | 'url'>,
): RecipeStartMethod =>
  idea.kind === 'LINK' && idea.url && toWebLink(idea.url) !== null
    ? 'link'
    : 'manual';

/** A reading made for an idea keeps what the person wrote there, their note and their title (unless it is only the site's name, which is what a failed lookup saved), and fills the rest. */
export const getReadingForIdea = (
  extracted: ExtractedRecipe,
  idea: Pick<Idea, 'title' | 'note' | 'url'>,
): ExtractedRecipe => {
  const host = idea.url ? getWebLinkHost(idea.url) : null;
  const isSiteName =
    host !== null && idea.title.trim().toLowerCase() === host.toLowerCase();
  const note = idea.note?.trim() ?? '';

  return {
    ...extracted,
    title: isSiteName ? (extracted.title ?? idea.title) : idea.title,
    description: note === '' ? extracted.description : idea.note,
  };
};
