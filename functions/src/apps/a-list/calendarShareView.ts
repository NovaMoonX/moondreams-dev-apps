const FORMATS = ['STANDARD', 'DOLBY_CINEMA', 'IMAX', 'PRIME', 'REALD_3D', 'LASER'];
const STATUSES = ['PLANNED', 'SEEN'];

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

export interface SharedCalendar {
  startDate: number;
  endDate: number;
  createdAt: number;
  viewings: SharedViewing[];
}

function toText(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maxLength) : null;
}

function toInt(value: unknown) {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function toViewing(raw: unknown): SharedViewing | null {
  const item = (raw ?? {}) as Record<string, unknown>;
  const title = toText(item.title, 200);
  const showtimeAt = toInt(item.showtimeAt);
  if (title === null || showtimeAt === null) {
    return null;
  }

  const posterUrl = toText(item.posterUrl, 500);
  const result: SharedViewing = {
    title,
    posterUrl: posterUrl?.startsWith('https://') ? posterUrl : null,
    runtimeMinutes: toInt(item.runtimeMinutes),
    contentRating: toText(item.contentRating, 20),
    showtimeAt,
    status: STATUSES.includes(item.status as string) ? (item.status as SharedViewing['status']) : 'PLANNED',
    format: FORMATS.includes(item.format as string) ? (item.format as string) : null,
    theatreName: toText(item.theatreName, 120),
  };
  return result;
}

/** Copies the allowlisted fields of a stored share into what a visitor receives, so nothing else on the document (the owner, the PIN) can ever leak. */
export function toSharedCalendar(data: Record<string, unknown>): SharedCalendar {
  const rawViewings = Array.isArray(data.viewings) ? data.viewings : [];
  const result: SharedCalendar = {
    startDate: toInt(data.startDate) ?? 0,
    endDate: toInt(data.endDate) ?? 0,
    createdAt: toInt(data.createdAt) ?? 0,
    viewings: rawViewings.map(toViewing).filter((viewing): viewing is SharedViewing => viewing !== null),
  };
  return result;
}
