import {
  MAX_COVER_URL_LENGTH,
  PHOTO_QUERY_MAX_TITLE_LENGTH,
  PHOTO_QUERY_MIN_TITLE_LENGTH,
  PHOTO_RESULT_COUNT,
} from '@apps/pinch/constants';
import type { Recipe, WebPhoto } from '@apps/pinch/types';

/** Whether a recipe has a cover to draw: an upload, or a web photo it keeps the address of. */
export const hasCover = (recipe: Pick<Recipe, 'coverPath' | 'coverUrl'>) =>
  Boolean(recipe.coverPath || recipe.coverUrl);

/** An https address of a length the rules take, with no sign-in in it. */
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

/** The site of an address without `www.`, or an empty string when it isn't one. */
export const getUrlHost = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** What the photo search is asked for a recipe's title: the title and the word "recipe", so a search for "Adobo" looks for the dish and not the island. Null while the title is too short to look for. */
export const getPhotoQuery = (title: string) => {
  const words = title.replace(/\s+/g, ' ').trim();
  return words.length < PHOTO_QUERY_MIN_TITLE_LENGTH
    ? null
    : `${words.slice(0, PHOTO_QUERY_MAX_TITLE_LENGTH).trim()} recipe`;
};

/** The same text asked twice reads as one search, so it is fetched once. */
export const getPhotoQueryKey = (query: string) =>
  query.replace(/\s+/g, ' ').trim().toLowerCase();

/** What the function answered, checked again here because it is a network answer: only https pictures with an https thumbnail, copied by name, at most six. */
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
  /** Where an uploaded file goes, used when there is one. */
  uploadPath: string;
  hasFile: boolean;
  /** The web photo the person picked, null when they picked none. */
  webUrl: string | null;
  removeCover: boolean;
  existing: Pick<Recipe, 'coverPath' | 'coverUrl'> | null;
}

/** The two cover fields a save writes. A recipe has at most one: the one chosen last wins and the other is written null in the same update. Untouched, an edit keeps what the recipe had (a missing `coverUrl` key reads as null and is written back). */
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
  /** The smaller picture for a small tile; the same address when there is only one. */
  thumbUrl: string;
  /** The site a web photo comes from, null for an upload (so a line that says "From ..." shows only for a web photo). */
  host: string | null;
}

interface ShownCoverInput {
  uploadUrl: string | null;
  web: WebPhoto | null;
  isRemoved: boolean;
  /** `coverUrl` of the recipe being edited. */
  savedWebUrl: string | null;
  /** The download address of the recipe's uploaded cover once it has loaded. */
  storageUrl: string | null;
}

/** The cover the form shows: an upload picked now, else a web photo picked now, else nothing once it was removed, else what the recipe already has. */
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
