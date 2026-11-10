import { daysUntil, nextYearlyOccurrence } from '@/utils/yearlyDateUtils';
import type { KeyDateKind, OpenWho, WhoKind, WhoTier } from '@apps/helm/types';
import { HELM_COPY } from '@apps/helm/constants';
import {
  countOn,
  describeKeyDate,
  formatDayLabel,
} from '@apps/helm/utils/keyDateText';
import type { ByWho } from '@apps/helm/utils/keyDateIndex';

/** One date that comes back, placed on its next day, with whose it is. */
export interface UpcomingKeyDate {
  id: string;
  whoId: string;
  whoName: string;
  whoKind: WhoKind;
  tier: WhoTier;
  isSelf: boolean;
  kind: KeyDateKind;
  label: string | null;
  month: number;
  day: number;
  year: number | null;
  /** The day it next falls on, "YYYY-MM-DD". */
  date: string;
  days: number;
  /** Age or years on that day; null with no year. */
  count: number | null;
  title: string;
}

/** Close people, pets and the person themself, then regular, then passing. */
export const getCloseness = (who: Pick<OpenWho, 'tier' | 'kind' | 'isSelf'>) =>
  who.isSelf || who.kind === 'pet' || who.tier === 'close'
    ? 0
    : who.tier === 'regular'
      ? 1
      : 2;

/** Every dated entry whose next day is within `withinDays` of today, soonest first, close before regular within a day. A who that is gone or unreadable has no dates shown; `forToday` also leaves out passing people and organizations. */
export function listUpcoming(input: {
  byWho: ByWho;
  whoById: Map<string, OpenWho>;
  todayKey: string;
  withinDays: number;
  forToday: boolean;
}): UpcomingKeyDate[] {
  const { byWho, whoById, todayKey, withinDays, forToday } = input;
  return Object.entries(byWho)
    .flatMap(([whoId, entries]) => {
      const who = whoById.get(whoId);
      if (!who || who.isUnreadable) return [];
      if (forToday && (who.tier === 'passing' || who.kind === 'organization')) {
        return [];
      }
      return entries.flatMap(([id, kind, month, day, year, label]) => {
        if (day === null) return [];
        const date = nextYearlyOccurrence({ month, day }, todayKey);
        const days = daysUntil(todayKey, date);
        if (days > withinDays) return [];
        return [
          {
            id,
            whoId,
            whoName: who.name,
            whoKind: who.kind,
            tier: who.tier,
            isSelf: who.isSelf,
            kind,
            label,
            month,
            day,
            year,
            date,
            days,
            count: countOn({ kind, year }, date),
            title: describeKeyDate({
              kind,
              label,
              whoName: who.name,
              whoKind: who.kind,
              isSelf: who.isSelf,
            }),
          },
        ];
      });
    })
    .sort(
      (a, b) =>
        a.days - b.days ||
        getCloseness({ tier: a.tier, kind: a.whoKind, isSelf: a.isSelf }) -
          getCloseness({ tier: b.tier, kind: b.whoKind, isSelf: b.isSelf }) ||
        a.title.localeCompare(b.title),
    );
}

/** Today's order: a date today or tomorrow first whoever it belongs to, then close people (pets and the person included), then regular, soonest first within each. */
export const orderForToday = (dates: UpcomingKeyDate[]) => {
  const closeness = (date: UpcomingKeyDate) =>
    getCloseness({
      tier: date.tier,
      kind: date.whoKind,
      isSelf: date.isSelf,
    });
  const isNear = (date: UpcomingKeyDate) => date.days <= 1;
  return [...dates].sort(
    (a, b) =>
      Number(!isNear(a)) - Number(!isNear(b)) ||
      (isNear(a)
        ? a.days - b.days || closeness(a) - closeness(b)
        : closeness(a) - closeness(b) || a.days - b.days) ||
      a.title.localeCompare(b.title),
  );
};

export interface MonthGroup {
  /** "2026-11". */
  key: string;
  dates: UpcomingKeyDate[];
}

/** The dates grouped by the month they fall in, in order. */
export const groupByMonth = (dates: UpcomingKeyDate[]): MonthGroup[] => {
  const groups = dates.reduce((byKey, date) => {
    const key = date.date.slice(0, 7);
    const list = byKey.get(key);
    if (list) list.push(date);
    else byKey.set(key, [date]);
    return byKey;
  }, new Map<string, UpcomingKeyDate[]>());
  return [...groups].map(([key, list]) => ({ key, dates: list }));
};

/** "November", or "January 2027" once the year is not today's. */
export function formatMonthHeading(key: string, todayKey: string) {
  const [year, month] = key.split('-').map(Number);
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    'en-US',
    { month: 'long', timeZone: 'UTC' },
  );
  return year === Number(todayKey.slice(0, 4)) ? name : `${name} ${year}`;
}

/** One quiet line on Today: "Maya turns 32 · Thu, Nov 12", "Grandpa's birthday · tomorrow", "Your anniversary with Maya · Fri, Nov 20 · 5 years". */
export function formatTodayLine(date: UpcomingKeyDate) {
  const day =
    date.days === 0
      ? HELM_COPY.keyDateTodayWord
      : date.days === 1
        ? HELM_COPY.keyDateTomorrowWord
        : formatDayLabel(date.date);
  const isTurning =
    date.kind === 'birthday' && date.count !== null && !date.isSelf;
  const lead =
    isTurning && date.count !== null
      ? HELM_COPY.keyDateTurnsLine(date.whoName, date.count)
      : date.title;
  const tail =
    date.kind !== 'birthday' && date.count !== null
      ? HELM_COPY.comingUpYears(date.count)
      : null;
  return [lead, day, tail].filter(Boolean).join(' · ');
}
