// Generated from src/apps/helm/engine/research.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
/** Research depth, the monthly allowance and when research says it arrives: pure, shared by the device and the server (vendored). */

export type ResearchDepth = 'light' | 'thorough';

export const RESEARCH_MONTHLY_CAP_CENTS = 200;

export const RESEARCH_DEPTHS: Record<
  ResearchDepth,
  {
    maxSearches: number;
    timeBudgetMs: number;
    maxSections: number;
    hasComparison: boolean;
    estimateCents: number;
  }
> = {
  light: {
    maxSearches: 3,
    timeBudgetMs: 2 * 60_000,
    maxSections: 3,
    hasComparison: false,
    estimateCents: 11,
  },
  thorough: {
    maxSearches: 10,
    timeBudgetMs: 8 * 60_000,
    maxSections: 5,
    hasComparison: true,
    estimateCents: 35,
  },
};

export interface ResearchUsage {
  /** "YYYY-MM" in the person's time zone; a usage from another month counts as empty. */
  month: string;
  /** Spent and reserved this month, in cents. */
  cents: number;
}

const readYearMonth = (now: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(now));
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: pick('year'), month: pick('month') };
};

/** The person's month as "YYYY-MM". */
export function toResearchMonth(now: number, timeZone: string) {
  const { year, month } = readYearMonth(now, timeZone);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The 1st of next month in the person's time zone, as a date-only value (UTC midnight). */
export function readResearchResetOn(now: number, timeZone: string) {
  const { year, month } = readYearMonth(now, timeZone);
  return Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1);
}

/** What this month's allowance allows: a live look at the asked depth, how many thorough looks are left, and when it resets. */
export function readResearchAllowance(
  usage: ResearchUsage | null,
  depth: ResearchDepth,
  now: number,
  timeZone: string,
) {
  const month = toResearchMonth(now, timeZone);
  const spent = usage !== null && usage.month === month ? usage.cents : 0;
  const leftCents = Math.max(0, RESEARCH_MONTHLY_CAP_CENTS - spent);
  const fits = (wanted: ResearchDepth) =>
    RESEARCH_DEPTHS[wanted].estimateCents <= leftCents;
  return {
    month,
    leftCents,
    isLive: fits(depth),
    canThorough: fits('thorough'),
    thoroughLeft: Math.floor(
      leftCents / RESEARCH_DEPTHS.thorough.estimateCents,
    ),
    resetOn: readResearchResetOn(now, timeZone),
  };
}

/** The depth to run at, or 'ask' when it wasn't said, there is no default and the answer feeds a decision. */
export function pickResearchDepth(input: {
  said: ResearchDepth | null;
  profileDefault: ResearchDepth | null;
  isDecision: boolean;
}): ResearchDepth | 'ask' {
  if (input.said) return input.said;
  if (input.profileDefault) return input.profileDefault;
  return input.isDecision ? 'ask' : 'light';
}

/** When research says it arrives: asked for now it starts now at either depth; only what was offered ahead or saved to learn later waits for morning. */
export function readResearchArrival(
  depth: ResearchDepth,
  when: 'now' | 'later',
): 'fewMinutes' | 'fiveToTen' | 'byMorning' {
  if (when === 'later') return 'byMorning';
  return depth === 'thorough' ? 'fiveToTen' : 'fewMinutes';
}

/** Whether a research item still wants its answer: one cancelled or already settled drops a late answer unread. */
export function isResearchStillWanted(
  status: string,
  preparedAt: number | null,
) {
  return status === 'preparing' && preparedAt === null;
}

/** Whether a "Look on Dec 1" rerun is due: the person's own day has reached the date-only `rerunOn`. */
export function isResearchRerunDue(
  rerunOn: number | null,
  now: number,
  timeZone: string,
) {
  if (rerunOn === null) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(now));
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const today = Date.UTC(pick('year'), pick('month') - 1, pick('day'));
  return today >= rerunOn;
}

/** When a waiting look last started, for the stuck sweep: its claim, else its latest start (a depth answer or a rerun stamps `lastEditedAt`), else when it was made. */
export function readResearchStartedSince(
  startedAt: unknown,
  lastEditedAt: unknown,
  createdAt: unknown,
): number | null {
  if (typeof startedAt === 'number') return startedAt;
  if (typeof lastEditedAt === 'number') return lastEditedAt;
  return typeof createdAt === 'number' ? createdAt : null;
}
