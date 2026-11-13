import type {
  KeyDate,
  KeyDateKind,
  KeyDateSealed,
  MomentPrecision,
} from '@apps/helm/types';

/** A who's one-time event, opened. A decade's `year` is its first. */
export interface WhoMoment {
  id: string;
  whoId: string;
  kind: KeyDateKind;
  label: string | null;
  precision: MomentPrecision;
  month: number | null;
  day: number | null;
  year: number;
  source: KeyDate['source'];
  createdAt: number;
  captureId: string | null;
}

export const getDecade = (year: number) => Math.floor(year / 10) * 10;

const KINDS: KeyDateKind[] = [
  'custom',
  'passedAway',
  'met',
  'adopted',
  'startedJob',
  'leftJob',
  'moved',
  'graduated',
];

export const MOMENT_PRECISIONS: MomentPrecision[] = [
  'day',
  'month',
  'year',
  'decade',
];

export const ALL_KEY_KINDS: KeyDateKind[] = [
  'birthday',
  'anniversary',
  ...KINDS,
];

/** A moment from its document and sealed words; null when the words don't make one. */
export function toMoment(
  id: string,
  data: Partial<KeyDate>,
  sealed: Partial<KeyDateSealed>,
): WhoMoment | null {
  const kind = KINDS.find((entry) => entry === sealed.kind);
  const precision = MOMENT_PRECISIONS.find(
    (entry) => entry === sealed.precision,
  );
  if (
    typeof data.whoId !== 'string' ||
    !kind ||
    !precision ||
    typeof sealed.year !== 'number'
  ) {
    return null;
  }
  return {
    id,
    whoId: data.whoId,
    kind,
    label: typeof sealed.label === 'string' ? sealed.label : null,
    precision,
    month: typeof sealed.month === 'number' ? sealed.month : null,
    day: typeof sealed.day === 'number' ? sealed.day : null,
    year: sealed.year,
    source: data.source ?? 'person',
    createdAt: data.createdAt ?? 0,
    captureId: typeof sealed.captureId === 'string' ? sealed.captureId : null,
  };
}

const rank = (moment: WhoMoment) => MOMENT_PRECISIONS.indexOf(moment.precision);

/** Newest first: by decade, then year, month and day; within a decade the decade-only moments come last, within a year the year-only ones, within a month the month-only ones. */
export const compareMoments = (a: WhoMoment, b: WhoMoment) =>
  getDecade(b.year) - getDecade(a.year) ||
  Number(a.precision === 'decade') - Number(b.precision === 'decade') ||
  b.year - a.year ||
  Number(a.precision === 'year') - Number(b.precision === 'year') ||
  (b.month ?? 0) - (a.month ?? 0) ||
  rank(a) - rank(b) ||
  (b.day ?? 0) - (a.day ?? 0) ||
  b.createdAt - a.createdAt;

export const sortMoments = (moments: WhoMoment[]) =>
  [...moments].sort(compareMoments);

export interface MomentDecade {
  decade: number;
  /** The moments only known to the decade, shown after the years. */
  sometime: WhoMoment[];
  years: { year: number; moments: WhoMoment[] }[];
}

/** Sorted moments grouped by decade, then year; a decade-only moment sits under its decade with no year. */
export function groupMoments(sorted: WhoMoment[]): MomentDecade[] {
  return sorted.reduce<MomentDecade[]>((groups, moment) => {
    const decade = getDecade(moment.year);
    const last = groups.at(-1);
    const current =
      last && last.decade === decade
        ? last
        : { decade, sometime: [], years: [] };
    const rest = current === last ? groups.slice(0, -1) : groups;
    if (moment.precision === 'decade') {
      return [...rest, { ...current, sometime: [...current.sometime, moment] }];
    }
    const lastYear = current.years.at(-1);
    const years =
      lastYear && lastYear.year === moment.year
        ? [
            ...current.years.slice(0, -1),
            { ...lastYear, moments: [...lastYear.moments, moment] },
          ]
        : [...current.years, { year: moment.year, moments: [moment] }];
    return [...rest, { ...current, years }];
  }, []);
}
