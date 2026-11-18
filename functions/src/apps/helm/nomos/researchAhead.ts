// Generated from src/apps/helm/engine/researchAhead.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
/** Research offered ahead of a dated project: when the offer is due, how a date move rewrites it, its back-off and the brief it sends. Pure, shared by the device and the server (vendored). */

const DAY_MS = 86_400_000;

export const RESEARCH_OFFERS_PER_PROJECT = 3;
export const LEAD_DAYS_MIN = 7;
export const LEAD_DAYS_MAX = 180;
export const LEAD_DAYS_DEFAULT = 56;
export const LEAD_QUESTIONS_MAX = 5;
/** Weeks the offer waits after the first and the second Not now; the third turns it off. */
export const AHEAD_BACKOFF_WEEKS = [2, 4] as const;

export type AheadOfferState = 'waiting' | 'taken' | 'off';

/** The readable part of one offer on a project; its words are sealed on the project. */
export interface AheadOfferMeta {
  id: string;
  leadDays: number;
  /** Date-only: the project's date minus `leadDays`; null while the project has no date. */
  offerOn: number | null;
  state: AheadOfferState;
  declineCount: number;
  /** Date-only: after a Not now, the first day it may come back. */
  nextEligibleOn: number | null;
  /** The day key it was first shown on Today, so Today offers it once. */
  shownOn: string | null;
  /** The research item a yes started. */
  researchId: string | null;
  /** When the person saw the "looked into it for you" line. */
  toldAt: number | null;
  createdAt: number;
}

export const clampLeadDays = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(LEAD_DAYS_MAX, Math.max(LEAD_DAYS_MIN, Math.round(value)))
    : LEAD_DAYS_DEFAULT;

/** The day the offer is due: the project's date-only target minus the lead, in whole UTC days. */
export const computeOfferOn = (targetDate: number | null, leadDays: number) =>
  targetDate === null ? null : targetDate - clampLeadDays(leadDays) * DAY_MS;

/** A project's date moved (or was cleared): every offer still waiting gets its day again; a taken or turned-off one keeps what it had. */
export const rewriteOfferDays = (
  offers: AheadOfferMeta[],
  targetDate: number | null,
): AheadOfferMeta[] =>
  offers.map((offer) =>
    offer.state === 'waiting'
      ? { ...offer, offerOn: computeOfferOn(targetDate, offer.leadDays) }
      : offer,
  );

/** Whether an offer may show today (`today` is the person's day as a UTC-midnight date): waiting, its day reached, the project's date still ahead, and any back-off over. */
export const isAheadOfferDue = (
  offer: AheadOfferMeta,
  targetDate: number | null,
  today: number,
) =>
  offer.state === 'waiting' &&
  offer.offerOn !== null &&
  targetDate !== null &&
  offer.offerOn <= today &&
  targetDate > today &&
  (offer.nextEligibleOn === null || offer.nextEligibleOn <= today);

/** The one offer a project shows today: the earliest due, then the oldest. */
export const pickAheadOffer = (
  offers: AheadOfferMeta[],
  targetDate: number | null,
  today: number,
) =>
  offers
    .filter((offer) => isAheadOfferDue(offer, targetDate, today))
    .sort(
      (a, b) =>
        (a.offerOn ?? 0) - (b.offerOn ?? 0) || a.createdAt - b.createdAt,
    )[0] ?? null;

/** Today shows an offer on the first day it is shown and never again; the project's page keeps it until it is answered. */
export const isAheadOfferForToday = (offer: AheadOfferMeta, todayKey: string) =>
  offer.shownOn === null || offer.shownOn === todayKey;

/** Not now: it waits 2 weeks, then 4; the third, or a wait that would reach the project's date, turns it off. */
export const applyAheadNotNow = (
  offer: AheadOfferMeta,
  targetDate: number | null,
  today: number,
): AheadOfferMeta => {
  const declineCount = offer.declineCount + 1;
  const weeks = AHEAD_BACKOFF_WEEKS[declineCount - 1];
  const nextEligibleOn =
    weeks === undefined ? null : today + weeks * 7 * DAY_MS;
  const isOff =
    nextEligibleOn === null ||
    targetDate === null ||
    nextEligibleOn >= targetDate;
  return {
    ...offer,
    declineCount,
    nextEligibleOn: isOff ? null : nextEligibleOn,
    state: isOff ? 'off' : 'waiting',
  };
};

export type LeadQuestionShape = 'text' | 'pickOne' | 'pickMany' | 'amountRange';

/** One question asked before looking; written by the model at offer time, answered on the sheet. */
export interface LeadQuestion {
  id: string;
  label: string;
  shape: LeadQuestionShape;
  /** pickOne and pickMany only; at most 8. */
  options: string[];
  /** Filled from the person's records where known: option labels, the text, or "min-max" in cents. */
  prefill: string[];
  /** Where the prefill came from ("From what you said · Nov 10"); null when nothing was filled. */
  from: string | null;
  /** The prefill was inferred rather than said (drawn hollow). */
  isInferred: boolean;
}

/** An amountRange prefill as cents, "min-max" with either side empty; null when it isn't one, so a source line never sits over blank boxes. */
export const readAmountRangePrefill = (text: string | undefined) => {
  const match = /^(\d*)-(\d*)$/.exec(text ?? '');
  if (!match) return null;
  const toCents = (part: string) => (Number(part) > 0 ? Number(part) : null);
  const min = toCents(match[1]);
  const max = toCents(match[2]);
  return min === null && max === null ? null : { min, max };
};

export type LeadAnswer =
  | { kind: 'text'; text: string }
  | { kind: 'picks'; picks: string[] }
  | { kind: 'range'; minCents: number | null; maxCents: number | null }
  | { kind: 'skipped' };

const formatDollars = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString('en-US')}`;

const answerWords = (answer: LeadAnswer | undefined) => {
  if (!answer || answer.kind === 'skipped') return null;
  if (answer.kind === 'text') return answer.text.trim() || null;
  if (answer.kind === 'picks')
    return answer.picks.length > 0 ? answer.picks.join(' or ') : null;
  const { minCents, maxCents } = answer;
  if (minCents !== null && maxCents !== null)
    return `${formatDollars(minCents)} to ${formatDollars(maxCents)}`;
  if (maxCents !== null) return `up to ${formatDollars(maxCents)}`;
  if (minCents !== null) return `from ${formatDollars(minCents)}`;
  return null;
};

/** The brief as it will be sent: "Apartments: Where: Ballard or Fremont; Rent a month: $2,200 to $2,800; thorough." */
export const buildAheadBrief = (input: {
  subject: string;
  questions: LeadQuestion[];
  answers: Record<string, LeadAnswer>;
  depth: 'light' | 'thorough';
}) => {
  const parts = input.questions.flatMap((question) => {
    const words = answerWords(input.answers[question.id]);
    return words ? [`${question.label}: ${words}`] : [];
  });
  const head = `${input.subject.charAt(0).toUpperCase()}${input.subject.slice(1)}`;
  const depthWord = input.depth === 'thorough' ? 'thorough' : 'quick look';
  return parts.length > 0
    ? `${head}: ${parts.join('; ')}; ${depthWord}.`
    : `${head}; ${depthWord}.`;
};

/** Whole weeks from today to the project's date, for "15 weeks from now". */
export const weeksUntil = (targetDate: number, today: number) =>
  Math.max(0, Math.round((targetDate - today) / (7 * DAY_MS)));
