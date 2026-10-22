import type { PageContent } from '@/lib/pageContent/fetchPageContent';
import { generateUuid } from '@/utils/idUtils';
import { clipAtWord } from '@/utils/stringUtils';
import {
  MAX_RECIPE_DESCRIPTION_LENGTH,
  MAX_RECIPE_TITLE_LENGTH,
} from '@apps/pinch/constants';
import type {
  Idea,
  RecipeLink,
  RecipeLinkKind,
  WebPhoto,
} from '@apps/pinch/types';
import type { ExtractedRecipe } from '@apps/pinch/utils/normalizeRecipe';
import { getUrlHost, isCoverUrl } from '@apps/pinch/utils/recipeCover';
import {
  getYouTubeId,
  getYouTubeWatchUrl,
  normalizeLinkUrl,
} from '@apps/pinch/utils/recipeLinks';

/** What a source tells us about a recipe beyond its words: a picture to start the cover on, and the address the recipe came from. Offered to the form, which the person reviews; nothing here is saved by itself. */
export interface ReadExtras {
  /** Pictures the source publishes for the dish, best first. */
  photos: WebPhoto[];
  link: {
    kind: Extract<RecipeLinkKind, 'HOW_TO' | 'ORIGINAL'>;
    url: string;
  } | null;
}

export const NO_EXTRAS: ReadExtras = { photos: [], link: null };

const YOUTUBE_HOST = 'youtube.com';

const getVideoPhoto = (id: string, size: string, thumb: string): WebPhoto => ({
  imageUrl: `https://i.ytimg.com/vi/${id}/${size}.jpg`,
  thumbUrl: `https://i.ytimg.com/vi/${id}/${thumb}.jpg`,
  title: '',
  host: YOUTUBE_HOST,
});

export const getVideoExtras = (text: string): ReadExtras => {
  const id = getYouTubeId(text);
  const url = getYouTubeWatchUrl(text);
  if (id === null || url === null) return NO_EXTRAS;

  const result: ReadExtras = {
    photos: [
      getVideoPhoto(id, 'maxresdefault', 'mqdefault'),
      getVideoPhoto(id, 'hqdefault', 'mqdefault'),
    ],
    link: { kind: 'HOW_TO', url },
  };
  return result;
};

const getPagePhoto = (image: string | null, pageUrl: string): WebPhoto[] =>
  isCoverUrl(image)
    ? [
        {
          imageUrl: image,
          thumbUrl: image,
          title: '',
          host: getUrlHost(pageUrl),
        },
      ]
    : [];

const getOriginalLink = (url: string): ReadExtras['link'] => {
  const normalized = normalizeLinkUrl(url);
  const result =
    normalized === null ? null : { kind: 'ORIGINAL' as const, url: normalized };
  return result;
};

export const getPageExtras = (
  page: PageContent,
  typedUrl: string,
): ReadExtras => {
  const pageUrl = page.url || typedUrl;
  const result: ReadExtras = {
    photos: getPagePhoto(page.meta?.image ?? null, pageUrl),
    link: getOriginalLink(pageUrl),
  };
  return result;
};

/** What a saved idea already knows about its link: the same extras a reading of that link would offer, from the picture the idea kept, with no new request. */
export const getIdeaExtras = (
  idea: Pick<Idea, 'kind' | 'url' | 'imageUrl'>,
): ReadExtras => {
  if (idea.kind !== 'LINK' || idea.url === null) return NO_EXTRAS;

  const video = getVideoExtras(idea.url);
  if (video.link !== null) return video;

  const result: ReadExtras = {
    photos: getPagePhoto(idea.imageUrl, idea.url),
    link: getOriginalLink(idea.url),
  };
  return result;
};

export const getExtraLinks = (extras: ReadExtras): RecipeLink[] =>
  extras.link === null
    ? []
    : [
        {
          id: generateUuid(),
          kind: extras.link.kind,
          label: null,
          url: extras.link.url,
        },
      ];

const TITLE_TAIL = /\s+[|–—•-]\s+[^|–—•-]*$/;
const MIN_TITLE_LENGTH = 3;

/** Fills a title or description the reader left empty from the page's own: the site's name after a bar or dash is dropped from the title. */
export const withPageFallbacks = (
  recipe: ExtractedRecipe,
  page: Pick<PageContent, 'title' | 'meta'>,
): ExtractedRecipe => {
  const fullTitle = (page.title ?? '').trim();
  const withoutSite = fullTitle.replace(TITLE_TAIL, '').trim();
  const pageTitle = clipAtWord(
    withoutSite.length >= MIN_TITLE_LENGTH ? withoutSite : fullTitle,
    MAX_RECIPE_TITLE_LENGTH,
  );
  const pageDescription = clipAtWord(
    (page.meta?.description ?? '').trim(),
    MAX_RECIPE_DESCRIPTION_LENGTH,
  );
  const result = {
    ...recipe,
    title: recipe.title ?? (pageTitle || null),
    description: recipe.description ?? (pageDescription || null),
  };
  return result;
};
