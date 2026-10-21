import {
  MAX_COVER_URL_LENGTH,
  PHOTO_QUERY_MAX_TITLE_LENGTH,
  PHOTO_QUERY_MIN_TITLE_LENGTH,
  PHOTO_RESULT_COUNT,
} from '@apps/pinch/constants';
import type { Recipe, WebPhoto } from '@apps/pinch/types';

export const hasCover = (recipe: Pick<Recipe, 'coverPath' | 'coverUrl'>) =>
  Boolean(recipe.coverPath || recipe.coverUrl);

/** Where a recipe's own cover lives in Storage: the only path the rules accept for it. */
export const getRecipeCoverPath = (uid: string, recipeId: string) =>
  `apps/pinch/kitchens/${uid}/recipes/${recipeId}/cover.webp`;

export const isCoverUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > MAX_COVER_URL_LENGTH) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname !== '' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
};

export const getUrlHost = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The word "recipe" makes a search for "Adobo" find the dish, not the island. */
export const getPhotoQuery = (title: string) => {
  const words = title.replace(/\s+/g, ' ').trim();
  return words.length < PHOTO_QUERY_MIN_TITLE_LENGTH
    ? null
    : `${words.slice(0, PHOTO_QUERY_MAX_TITLE_LENGTH).trim()} recipe`;
};

export const getPhotoQueryKey = (query: string) =>
  query.replace(/\s+/g, ' ').trim().toLowerCase();

/** A network answer is checked again here and copied by name. */
export const toWebPhotos = (value: unknown): WebPhoto[] => {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry): WebPhoto[] => {
      if (entry === null || typeof entry !== 'object') return [];
      const { thumbUrl, imageUrl, title, host } = entry as Record<
        string,
        unknown
      >;
      return isCoverUrl(thumbUrl) && isCoverUrl(imageUrl)
        ? [
            {
              thumbUrl,
              imageUrl,
              title: typeof title === 'string' ? title : '',
              host: typeof host === 'string' ? host : getUrlHost(imageUrl),
            },
          ]
        : [];
    })
    .slice(0, PHOTO_RESULT_COUNT);
};

interface CoverChoice {
  uploadPath: string;
  hasFile: boolean;
  webUrl: string | null;
  removeCover: boolean;
  existing: Pick<Recipe, 'coverPath' | 'coverUrl'> | null;
}

/** A recipe has at most one cover: the one chosen last wins and the other is written null in the same update. */
export const getCoverFields = ({
  uploadPath,
  hasFile,
  webUrl,
  removeCover,
  existing,
}: CoverChoice): { coverPath: string | null; coverUrl: string | null } => {
  if (hasFile) return { coverPath: uploadPath, coverUrl: null };
  if (webUrl !== null) return { coverPath: null, coverUrl: webUrl };
  if (removeCover) return { coverPath: null, coverUrl: null };
  return {
    coverPath: existing?.coverPath ?? null,
    coverUrl: existing?.coverUrl ?? null,
  };
};

export interface ShownCover {
  url: string;
  thumbUrl: string;
  /** Null for an upload, so a "From ..." line shows only for a web photo. */
  host: string | null;
}

interface ShownCoverInput {
  uploadUrl: string | null;
  web: WebPhoto | null;
  isRemoved: boolean;
  savedWebUrl: string | null;
  storageUrl: string | null;
}

export const getShownCover = ({
  uploadUrl,
  web,
  isRemoved,
  savedWebUrl,
  storageUrl,
}: ShownCoverInput): ShownCover | null => {
  if (uploadUrl) return { url: uploadUrl, thumbUrl: uploadUrl, host: null };
  if (web) return { url: web.imageUrl, thumbUrl: web.thumbUrl, host: web.host };
  if (isRemoved) return null;
  if (savedWebUrl) {
    return {
      url: savedWebUrl,
      thumbUrl: savedWebUrl,
      host: getUrlHost(savedWebUrl),
    };
  }
  return storageUrl
    ? { url: storageUrl, thumbUrl: storageUrl, host: null }
    : null;
};
