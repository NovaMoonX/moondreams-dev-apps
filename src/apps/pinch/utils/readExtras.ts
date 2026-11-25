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

const ISO_DURATION =
  /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?$/i;

/** Whole minutes in an ISO 8601 duration such as "PT1H15M"; null for anything else or zero. */
export const readIsoMinutes = (value: unknown): number | null => {
  const match =
    typeof value === 'string' ? ISO_DURATION.exec(value.trim()) : null;
  if (!match || value === 'P' || value === 'PT') return null;
  const [days, hours, minutes] = match
    .slice(1)
    .map((part) => Number(part ?? 0));
  const total = days * 24 * 60 + hours * 60 + minutes;
  return total > 0 ? total : null;
};

const SERVINGS_YIELD =
  /^\s*(?:serves\s+|makes\s+)?(\d+)(?:\s*(?:-|to|–)\s*\d+)?\s*(?:servings?|people|persons?|portions?|helpings?)?\s*$/i;

/** Servings in a Recipe's `recipeYield` when it reads as servings ("8", "8 servings", "Serves 6-8", ["8", "8 servings"], 8); a pan, loaf, dozen or quart is no count of servings. */
export const readYieldServings = (value: unknown): number | null => {
  const found = (Array.isArray(value) ? value : [value])
    .map((entry) =>
      typeof entry === 'number'
        ? entry
        : Number(SERVINGS_YIELD.exec(String(entry ?? ''))?.[1]),
    )
    .find((count) => Number.isInteger(count) && count > 0 && count <= 500);
  return found ?? null;
};

const getPublished = (
  nodes: readonly Record<string, unknown>[] | undefined,
  key: string,
) => nodes?.map((node) => node[key]).find((value) => value != null) ?? null;

/** Fills what the reader left empty from the page's own: a title or description, and the prep time, cook time and servings its Recipe data publishes (servings from the page replace an estimate). The site's name after a bar or dash is dropped from the title. */
export const withPageFallbacks = (
  recipe: ExtractedRecipe,
  page: Pick<PageContent, 'title' | 'meta' | 'structuredData'>,
): ExtractedRecipe => {
  const nodes = page.structuredData;
  const publishedServings = readYieldServings(
    getPublished(nodes, 'recipeYield'),
  );
  const hasPublishedServings =
    publishedServings !== null &&
    (recipe.servings === null || recipe.isServingsEstimate);
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
    prepMinutes:
      recipe.prepMinutes ?? readIsoMinutes(getPublished(nodes, 'prepTime')),
    cookMinutes:
      recipe.cookMinutes ?? readIsoMinutes(getPublished(nodes, 'cookTime')),
    servings: hasPublishedServings ? publishedServings : recipe.servings,
    isServingsEstimate: hasPublishedServings
      ? false
      : recipe.isServingsEstimate,
  };
  return result;
};
