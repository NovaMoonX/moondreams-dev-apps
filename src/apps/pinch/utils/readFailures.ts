import type { RecipeSource } from '@apps/pinch/types';

/** Why a reading failed, told by what is to blame: the connection or the reader, the link, or what the reader found. */
export type ReadFailure =
  'unreachable' | 'busy' | 'unavailable' | 'link' | 'unread' | 'empty';

interface ErrorShape {
  code?: unknown;
  message?: unknown;
  customErrorData?: { status?: unknown };
}

const LINK_CODES = ['invalid-argument', 'not-found', 'failed-precondition'];
const REFUSED_CODES = ['unauthenticated', 'permission-denied'];
const LINK_UNOPENED_MESSAGE = "Couldn't load that link.";
const NETWORK_MESSAGE = /failed to fetch|load failed|networkerror/i;

const asShape = (error: unknown): ErrorShape =>
  typeof error === 'object' && error !== null ? error : {};

const classifyCallable = (kind: string, message: unknown): ReadFailure => {
  if (LINK_CODES.includes(kind)) return 'link';
  if (kind === 'unavailable' && message === LINK_UNOPENED_MESSAGE) {
    return 'link';
  }
  if (kind === 'resource-exhausted') return 'busy';
  if (REFUSED_CODES.includes(kind)) return 'unavailable';
  return 'unreachable';
};

/** What a failed reading was caused by. Offline is always the connection, whatever the error says; a page the function could not open is the link, and any other trouble reaching the function or the AI is the reader. */
export function classifyReadFailure(
  error: unknown,
  isOnline: boolean,
): ReadFailure {
  if (!isOnline) return 'unreachable';

  const { code, message, customErrorData } = asShape(error);
  const status = customErrorData?.status;
  if (typeof code === 'string' && code.startsWith('functions/')) {
    return classifyCallable(code.slice('functions/'.length), message);
  }
  if (typeof status === 'number' && (status === 429 || status >= 500)) {
    return 'busy';
  }
  if (status === 403 || status === 404) return 'unavailable';
  if (code === 'fetch-error' && status === undefined) return 'unreachable';
  if (typeof message === 'string' && NETWORK_MESSAGE.test(message)) {
    return 'unreachable';
  }
  return 'unread';
}

const getUnreadLine = (source: RecipeSource, isVideo: boolean) => {
  if (isVideo) {
    return "We couldn't read a recipe from that video. It may be private or too long.";
  }
  if (source === 'AI_LINK') return "We couldn't read a recipe from that page.";
  if (source === 'AI_TEXT') {
    return "We couldn't read that text right now. Try again.";
  }
  return "We couldn't read that file right now. Try a clearer photo or a PDF.";
};

const getEmptyLine = (source: RecipeSource, isVideo: boolean) => {
  if (isVideo) return "We couldn't find a recipe in that video.";
  if (source === 'AI_LINK') return "We couldn't find a recipe on that page.";
  if (source === 'AI_TEXT') {
    return "We couldn't find a recipe in that text. Try pasting the whole recipe.";
  }
  return "We couldn't find a recipe in that file. Try a clearer photo.";
};

/** The sentence under the field for a failure. It names only what caused it and what the person can do on this screen; a YouTube video is named as a video, not a page. */
export function getReadFailureLine(
  cause: ReadFailure,
  source: RecipeSource,
  isVideo = false,
) {
  if (cause === 'unreachable') {
    return "We couldn't reach the reader. Check your connection and try again.";
  }
  if (cause === 'busy') {
    return 'The reader is busy right now. Give it a minute and try again.';
  }
  if (cause === 'unavailable') {
    return "The recipe reader isn't available right now. Try again later.";
  }
  if (cause === 'link' && source === 'AI_LINK') {
    return "We couldn't open that link. Check the address and try again.";
  }
  return cause === 'empty'
    ? getEmptyLine(source, isVideo)
    : getUnreadLine(source, isVideo);
}

/** Whether pasting the page's text could get past this failure: only when the link or what the reader found is the trouble, never the connection or the reader. */
export function canPasteTextInstead(cause: ReadFailure) {
  const result = cause === 'link' || cause === 'unread' || cause === 'empty';
  return result;
}

/** The sentence under a product link when its reading fails: the cause, and that the price can be typed in below. */
export function getProductReadFailureLine(cause: ReadFailure) {
  if (cause === 'unreachable') {
    return "We couldn't reach the reader. Check your connection and try again.";
  }
  if (cause === 'busy') {
    return 'The reader is busy right now. Give it a minute and try again.';
  }
  if (cause === 'unavailable') {
    return "The reader isn't available right now. You can type the price in below.";
  }
  if (cause === 'link') {
    return "We couldn't open that page. Some stores don't let apps read their pages, so you can type the price in below.";
  }
  return cause === 'empty'
    ? "We couldn't find a price on that page. You can type it in below."
    : "We couldn't read that page right now. You can type the price in below.";
}
