import { generateUuid } from '@/utils/idUtils';
import {
  getWebLinkHost,
  hasSeveralWebLinks,
  toWebLink,
} from '@/utils/urlUtils';
import {
  MAX_LINK_LABEL_LENGTH,
  MAX_LINK_URL_LENGTH,
  MAX_RECIPE_LINKS,
  RECIPE_LINK_LABELS,
} from '@apps/pinch/constants';
import type { Recipe, RecipeLink, RecipeLinkKind } from '@apps/pinch/types';

type OtherLinkKind = Exclude<RecipeLinkKind, 'HOW_TO'>;

/** One of the other links as the form holds it: the default label it starts on, or the person's own words once `isCustom`. */
export interface LinkDraft {
  id: string;
  kind: OtherLinkKind;
  label: string;
  isCustom: boolean;
  url: string;
}

/** What the links editor holds: the how-to video's one address, and the other links as rows. */
export interface LinksText {
  howTo: { id: string; label: string | null; url: string };
  others: LinkDraft[];
}

const KINDS = Object.keys(RECIPE_LINK_LABELS) as RecipeLinkKind[];
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
]);
const YOUTUBE_ID_PATHS = new Set(['shorts', 'embed', 'live', 'v']);

const isBlank = (text: string) => text.trim() === '';

/** A pasted web link as an http(s) address of a storable length, or null. */
export const normalizeLinkUrl = (text: string) => {
  const link = toWebLink(text);
  const result =
    link !== null && link.length <= MAX_LINK_URL_LENGTH ? link : null;
  return result;
};

/** The video id in a YouTube link of any usual form (`youtu.be/…`, `/watch?v=…`, `/shorts/…`, `/embed/…`), or null for anything else, a playlist alone included. */
export const getYouTubeId = (text: string) => {
  const link = normalizeLinkUrl(text);
  if (link === null) return null;

  const url = new URL(link);
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  const [, first, second] = url.pathname.split('/');
  const getCandidate = () => {
    if (host === 'youtu.be') return first;
    if (!YOUTUBE_HOSTS.has(host)) return undefined;
    if (first === 'watch') return url.searchParams.get('v') ?? undefined;
    return YOUTUBE_ID_PATHS.has(first) ? second : undefined;
  };
  const candidate = getCandidate();
  const result =
    candidate !== undefined && YOUTUBE_ID.test(candidate) ? candidate : null;
  return result;
};

export const getYouTubeThumbnailUrl = (id: string) =>
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** A how-to video the recipe drawer can play in place: the address the player loads, and the host's own picture when we can name it without asking anyone. */
export interface InlineVideo {
  src: string;
  thumbnailUrl: string | null;
}

const VIMEO_HOSTS = new Set(['vimeo.com', 'player.vimeo.com']);

const getVimeoSrc = (url: URL) => {
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  const [, first, second, third] = url.pathname.split('/');
  const [id, privacyHash] =
    first === 'video' ? [second, third] : [first, second];
  const isVideo = VIMEO_HOSTS.has(host) && /^\d{5,12}$/.test(id ?? '');
  const hash = /^[a-z0-9]{6,20}$/i.test(privacyHash ?? '')
    ? `/${privacyHash}`
    : '';
  const result = isVideo ? `https://vimeo.com/${id}${hash}` : null;
  return result;
};

/** The video behind a YouTube or Vimeo link, or null for any other address (those stay link rows). A YouTube link plays from the no-cookie host and keeps its start time. */
export const getInlineVideo = (text: string): InlineVideo | null => {
  const link = normalizeLinkUrl(text);
  if (link === null) return null;

  const youTubeId = getYouTubeId(link);
  if (youTubeId !== null) {
    const start = new URL(link).searchParams.get('t');
    const query =
      start !== null && /^[\dms]+$/i.test(start) ? `?t=${start}` : '';
    return {
      src: `https://www.youtube-nocookie.com/embed/${youTubeId}${query}`,
      thumbnailUrl: getYouTubeThumbnailUrl(youTubeId),
    };
  }

  const vimeoSrc = getVimeoSrc(new URL(link));
  const result =
    vimeoSrc === null ? null : { src: vimeoSrc, thumbnailUrl: null };
  return result;
};

export const getLinkHost = (url: string) => getWebLinkHost(url) ?? '';

const asKind = (value: unknown): RecipeLinkKind =>
  KINDS.find((kind) => kind === value) ?? 'OTHER';

const asLabel = (value: unknown) => {
  const text =
    typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_LINK_LABEL_LENGTH).trim()
      : '';
  const result = text === '' ? null : text;
  return result;
};

/** Links as stored, or anything a document might hold: entries without a web address are dropped, the first how-to wins (a later one reads as a plain link) and no more than the cap are kept. */
export const cleanLinks = (raw: unknown): RecipeLink[] => {
  const entries: unknown[] = Array.isArray(raw) ? raw : [];
  const result = entries.reduce<RecipeLink[]>((acc, entry) => {
    const item =
      typeof entry === 'object' && entry !== null
        ? (entry as Record<string, unknown>)
        : {};
    const url =
      typeof item.url === 'string' ? normalizeLinkUrl(item.url) : null;
    if (url === null || acc.length >= MAX_RECIPE_LINKS) return acc;

    const asked = asKind(item.kind);
    const kind =
      asked === 'HOW_TO' && acc.some((link) => link.kind === 'HOW_TO')
        ? 'OTHER'
        : asked;
    const id =
      typeof item.id === 'string' && item.id !== ''
        ? item.id
        : `link-${acc.length}`;
    return [...acc, { id, kind, label: asLabel(item.label), url }];
  }, []);
  return result;
};

/** A recipe's links; one written before links existed has none. */
export const getRecipeLinks = (recipe: { links?: Recipe['links'] }) =>
  cleanLinks(recipe.links);

export const getHowToLink = (links: RecipeLink[]) =>
  links.find((link) => link.kind === 'HOW_TO') ?? null;

export const getOtherLinks = (links: RecipeLink[]) =>
  links.filter((link) => link.kind !== 'HOW_TO');

export const getLinkLabel = (link: RecipeLink) =>
  link.label ?? RECIPE_LINK_LABELS[link.kind];

const toLinkDraft = (link: RecipeLink): LinkDraft => ({
  id: link.id,
  kind: link.kind === 'HOW_TO' ? 'OTHER' : link.kind,
  label: link.label ?? '',
  isCustom: link.label !== null,
  url: link.url,
});

export const getLinksText = (links: RecipeLink[]): LinksText => {
  const howTo = getHowToLink(links);
  const result: LinksText = {
    howTo: {
      id: howTo?.id ?? generateUuid(),
      label: howTo?.label ?? null,
      url: howTo?.url ?? '',
    },
    others: getOtherLinks(links).map(toLinkDraft),
  };
  return result;
};

export const getBlankLinkDraft = (): LinkDraft => ({
  id: generateUuid(),
  kind: 'OTHER',
  label: '',
  isCustom: false,
  url: '',
});

/** The links a form saves: the how-to video first, then the others in order; a blank slot or row is dropped. */
export const toRecipeLinks = ({ howTo, others }: LinksText): RecipeLink[] => {
  const howToUrl = normalizeLinkUrl(howTo.url);
  const first: RecipeLink[] =
    howToUrl === null
      ? []
      : [{ id: howTo.id, kind: 'HOW_TO', label: howTo.label, url: howToUrl }];
  const rest = others.flatMap((draft) => {
    const url = normalizeLinkUrl(draft.url);
    return url === null
      ? []
      : [
          {
            id: draft.id,
            kind: draft.kind,
            label: draft.isCustom ? asLabel(draft.label) : null,
            url,
          },
        ];
  });
  const result = cleanLinks([...first, ...rest]);
  return result;
};

/** Why one typed address can't be saved, or null for a blank or usable one. */
export const getLinkUrlProblem = (text: string) => {
  if (isBlank(text) || normalizeLinkUrl(text) !== null) return null;
  const result = hasSeveralWebLinks(text)
    ? 'That looks like more than one link. Paste one at a time.'
    : "That doesn't look like a web address.";
  return result;
};

export const hasLinksProblem = ({ howTo, others }: LinksText) =>
  getLinkUrlProblem(howTo.url) !== null ||
  others.some((draft) => getLinkUrlProblem(draft.url) !== null);

/** How many links the cap counts: the how-to slot once it holds something, and each row that has an address. */
export const countLinkSlots = ({ howTo, others }: LinksText) =>
  (isBlank(howTo.url) ? 0 : 1) +
  others.filter((draft) => !isBlank(draft.url)).length;

export const isOverLinkCap = (text: LinksText) =>
  countLinkSlots(text) > MAX_RECIPE_LINKS;

/** Another link can be added while there is room and no row is waiting for its address. */
export const canAddLink = (text: LinksText) =>
  countLinkSlots(text) < MAX_RECIPE_LINKS &&
  !text.others.some((draft) => isBlank(draft.url));

/** The Links row's one-line value: "How-to video + 2 links". */
export const getLinksSummary = ({ howTo, others }: LinksText) => {
  const count = others.filter((draft) => !isBlank(draft.url)).length;
  const result = [
    !isBlank(howTo.url) && 'How-to video',
    count > 0 && `${count} ${count === 1 ? 'link' : 'links'}`,
  ]
    .filter(Boolean)
    .join(' + ');
  return result;
};
