/** Parses a user-entered link, accepting only http(s) URLs whose hostname ends in a real-looking
 * TLD. Returns null for anything else, including `javascript:` and `data:` links. */
export function parseHttpUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    const isHttp = ['http:', 'https:'].includes(parsed.protocol);
    const result = isHttp && /\.[a-z]{2,}$/i.test(parsed.hostname) ? parsed : null;
    return result;
  } catch {
    return null;
  }
}

export function isValidHttpUrl(value: string) {
  return parseHttpUrl(value) !== null;
}

/** Like `isValidHttpUrl`, but a plain `http://` link is not accepted. */
export function isValidHttpsUrl(value: string) {
  return parseHttpUrl(value)?.protocol === 'https:';
}

const getLinkTokens = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .filter((token) => /^https?:\/\//i.test(token));

/** True when pasted text holds two or more links. */
export function hasSeveralWebLinks(text: string) {
  return getLinkTokens(text).length > 1;
}

/** A pasted web link as an http(s) address, or null; one link among other words is picked out, and a link wrapped over lines with no scheme is joined. */
export function toWebLink(text: string) {
  const trimmed = text.trim();
  const tokens = getLinkTokens(trimmed);
  const candidate = /\s/.test(trimmed)
    ? (tokens[0] ?? trimmed.replace(/\s+/g, ''))
    : trimmed;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  const parsed =
    tokens.length > 1 || candidate === '' ? null : parseHttpUrl(withScheme);
  const result =
    parsed && parsed.username === '' && parsed.password === ''
      ? parsed.toString()
      : null;
  return result;
}

/** The site a web link is on, without `www.`. */
export function getWebLinkHost(text: string) {
  const link = toWebLink(text);
  return link ? new URL(link).hostname.replace(/^www\./i, '') : null;
}

const TRACKING_PARAMETER =
  /^(utm_.*|fbclid|gclid|igshid|igsh|mc_cid|mc_eid|si|mibextid)$/i;

/** What makes two web links the same page: no scheme, `www.`, fragment, trailing slash or tracking parameters. */
export function getComparableUrl(text: string) {
  const link = toWebLink(text);
  if (!link) {
    return null;
  }

  const url = new URL(link);
  const query = new URLSearchParams(
    [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMETER.test(key))
      .sort(([keyA, valueA], [keyB, valueB]) => keyA.localeCompare(keyB) || valueA.localeCompare(valueB)),
  ).toString();
  const result = `${url.host.replace(/^www\./i, '')}${url.pathname.replace(/\/+$/, '')}${query ? `?${query}` : ''}`;
  return result;
}
