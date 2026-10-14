import { getComparableUrl, getWebLinkHost, toWebLink } from '@/utils/urlUtils';
import {
  MAX_IDEA_SITE_NAME_LENGTH,
  MAX_IDEA_TITLE_LENGTH,
  MAX_IDEA_URL_LENGTH,
} from '@apps/pinch/constants';
import type { Idea } from '@apps/pinch/types';

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

  return site ?? firstLine;
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
