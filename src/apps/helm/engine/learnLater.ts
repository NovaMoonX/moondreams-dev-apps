import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { findFreeGaps, type PlannerInput } from '@apps/helm/engine/planner';
import type { LearnOffer, OpenResearch } from '@apps/helm/types';

export const LEARN_MINUTES = 30;
const MINUTE_MS = 60_000;
const NEEDS_EXTRA_MINUTES = 15;
const EDGE_MINUTES = 30;
const BUSY_DAY_SHARE = 0.75;
const RECENT_OFFERS = 8;
const RECENT_OFFER_DAYS = 30;
const NOT_NOW_STREAK_ASKS = 3;

export type EveningKind = 'weekday' | 'weekend';

export interface LearnSlot {
  startAt: number;
  endAt: number;
  dayKind: EveningKind;
  gapMinutes: number;
}

/** Whether a day key falls on a weekend. */
export const toEveningKind = (dayKey: string): EveningKind => {
  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? 'weekend' : 'weekday';
};

const getKindScore = (kind: EveningKind, offers: LearnOffer[], now: number) => {
  const recent = offers
    .filter(
      (offer) =>
        offer.dayKind === kind &&
        now - offer.at < RECENT_OFFER_DAYS * 24 * 60 * MINUTE_MS,
    )
    .slice(-RECENT_OFFERS);
  const yes = recent.filter((offer) => offer.outcome === 'yes').length;
  return { yes, notNow: recent.length - yes };
};

/** A free half hour for something saved to learn: 45 minutes or more clear, 30 minutes inside each edge of Your day, never a rest day, a busy day or a day viewed ahead; the last third of the day comes first, and a kind of evening the person keeps declining is skipped. */
export function findLearnSlot(input: {
  plan: PlannerInput;
  busyShare: number;
  offers: LearnOffer[];
  isToday: boolean;
}): LearnSlot | null {
  const { plan, busyShare, offers, isToday } = input;
  if (!isToday || plan.restDay !== null || busyShare >= BUSY_DAY_SHARE)
    return null;
  const dayKind = toEveningKind(plan.dayKey);
  const dayStart = zonedDateTimeToEpoch(
    plan.dayKey,
    plan.dayStartTime,
    plan.timeZone,
  );
  const dayEnd = zonedDateTimeToEpoch(
    plan.dayKey,
    plan.dayEndTime,
    plan.timeZone,
  );
  const score = getKindScore(dayKind, offers, dayStart);
  if (score.notNow - score.yes >= 2) return null;
  const lastThird = dayStart + ((dayEnd - dayStart) * 2) / 3;
  const earliest = dayStart + EDGE_MINUTES * MINUTE_MS;
  const latest = dayEnd - EDGE_MINUTES * MINUTE_MS;
  const slots = findFreeGaps(plan, LEARN_MINUTES + NEEDS_EXTRA_MINUTES).flatMap(
    (gap) => {
      const startAt = Math.max(gap.startAt, earliest);
      const endAt = Math.min(gap.endAt, latest);
      return endAt - startAt >= LEARN_MINUTES * MINUTE_MS
        ? [
            {
              startAt,
              endAt: startAt + LEARN_MINUTES * MINUTE_MS,
              dayKind,
              gapMinutes: Math.round((gap.endAt - gap.startAt) / MINUTE_MS),
            },
          ]
        : [];
    },
  );
  const evening = slots.filter((slot) => slot.startAt >= lastThird);
  return (evening.length > 0 ? evening : slots)[0] ?? null;
}

export interface LearnOfferReading {
  item: OpenResearch;
  /** `still` when the person has put it off three times and Today asks whether they still want it, instead of offering it. */
  ask: 'offer' | 'still';
}

/** The saved questions Today may offer, best first: ready, not offered another day and not failed today; the one already shown today stays first, then the one offered longest ago (never offered first), then the oldest saved. */
export function readLearnOffers(input: {
  items: OpenResearch[];
  todayKey: string;
  timeZone: string;
}): LearnOfferReading[] {
  const { items, todayKey, timeZone } = input;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dayOf = (at: number) => formatter.format(new Date(at));
  const eligible = items
    .filter(
      (item) =>
        item.mode === 'learnLater' &&
        !item.isUnreadable &&
        (item.status === 'ready' || item.status === 'offered') &&
        (item.offeredOn === null || item.offeredOn === todayKey) &&
        (item.prepareFailedAt === null ||
          dayOf(item.prepareFailedAt) !== todayKey),
    )
    .sort(
      (a, b) =>
        Number(b.offeredOn === todayKey) - Number(a.offeredOn === todayKey) ||
        (a.offers.at(-1)?.at ?? 0) - (b.offers.at(-1)?.at ?? 0) ||
        a.createdAt - b.createdAt,
    );
  return eligible.map((item) => ({
    item,
    ask: item.notNowStreak >= NOT_NOW_STREAK_ASKS ? 'still' : 'offer',
  }));
}

/** The saved question Today offers first. */
export const readLearnOffer = (input: Parameters<typeof readLearnOffers>[0]) =>
  readLearnOffers(input)[0] ?? null;
