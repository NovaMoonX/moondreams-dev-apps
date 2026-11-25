const FORMATS = ['STANDARD', 'DOLBY_CINEMA', 'IMAX', 'PRIME', 'REALD_3D', 'LASER'];
const STATUSES = ['PLANNED', 'SEEN'];
const POSTER_HOSTS = ['image.tmdb.org', 'm.media-amazon.com'];

export interface SharedViewing {
  title: string;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  contentRating: string | null;
  showtimeAt: number;
  status: 'PLANNED' | 'SEEN';
  format: string | null;
  theatreName: string | null;
}

export type ShareKind = 'SNAPSHOT' | 'LIVE';

export interface SharedCalendar {
  kind: ShareKind;
  /** Date-only; null for a live share, which covers everything. */
  startDate: number | null;
  endDate: number | null;
  createdAt: number;
  viewings: SharedViewing[];
}

/** Showings a live share keeps at most, the latest first, so a long history can't outgrow one document. */
export const MAX_LIVE_SHARED_VIEWINGS = 1000;

function toText(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maxLength) : null;
}

function toInt(value: unknown) {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function toPosterUrl(value: unknown) {
  const text = toText(value, 500);
  if (text === null) {
    return null;
  }

  try {
    const url = new URL(text);
    return url.protocol === 'https:' && POSTER_HOSTS.includes(url.hostname) ? text : null;
  } catch {
    return null;
  }
}

function toViewing(raw: unknown): SharedViewing | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  const title = toText(item.title, 200);
  const showtimeAt = toInt(item.showtimeAt);
  if (title === null || showtimeAt === null) {
    return null;
  }

  const posterUrl = toPosterUrl(item.posterUrl);
  const result: SharedViewing = {
    title,
    posterUrl,
    runtimeMinutes: toInt(item.runtimeMinutes),
    contentRating: toText(item.contentRating, 20),
    showtimeAt,
    status: STATUSES.includes(item.status as string) ? (item.status as SharedViewing['status']) : 'PLANNED',
    format: FORMATS.includes(item.format as string) ? (item.format as string) : null,
    theatreName: toText(item.theatreName, 120),
  };
  return result;
}

export function getShareKind(data: Record<string, unknown>): ShareKind {
  return data.kind === 'LIVE' ? 'LIVE' : 'SNAPSHOT';
}

function toViewings(rawViewings: unknown[]) {
  return rawViewings.map(toViewing).filter((viewing): viewing is SharedViewing => viewing !== null);
}

/** One stored showing trimmed to the share's allowlist; a field added to a showing later never reaches a visitor. */
export function fromStoredViewing(raw: Record<string, unknown>) {
  const movie = (raw.movie ?? {}) as Record<string, unknown>;
  const ticket = (raw.ticket ?? {}) as Record<string, unknown>;
  const theatre = (raw.theatre ?? {}) as Record<string, unknown>;
  return toViewing({
    title: movie.title,
    posterUrl: movie.posterUrl,
    runtimeMinutes: movie.runtimeMinutes,
    contentRating: movie.contentRating,
    showtimeAt: raw.showtimeAt,
    status: raw.status,
    format: ticket.format,
    theatreName: theatre.name,
  });
}

/** Every showing on the calendar, oldest first, capped to the latest ones. */
export function toLiveViewings(storedViewings: Record<string, unknown>[]): SharedViewing[] {
  const result = storedViewings
    .map(fromStoredViewing)
    .filter((viewing): viewing is SharedViewing => viewing !== null)
    .sort((left, right) => right.showtimeAt - left.showtimeAt)
    .slice(0, MAX_LIVE_SHARED_VIEWINGS)
    .reverse();
  return result;
}

/**
 * Copies the allowlisted fields of a stored share into what a visitor receives, so nothing else on the document (the owner, the PIN) can ever leak.
 * A live share's showings are read from the owner's calendar by the caller and passed in.
 */
export function toSharedCalendar(data: Record<string, unknown>, liveViewings: SharedViewing[] = []): SharedCalendar {
  const kind = getShareKind(data);
  const rawViewings = Array.isArray(data.viewings) ? data.viewings : [];
  const result: SharedCalendar = {
    kind,
    startDate: kind === 'LIVE' ? null : (toInt(data.startDate) ?? 0),
    endDate: kind === 'LIVE' ? null : (toInt(data.endDate) ?? 0),
    createdAt: toInt(data.createdAt) ?? 0,
    viewings: kind === 'LIVE' ? liveViewings : toViewings(rawViewings),
  };
  return result;
}
