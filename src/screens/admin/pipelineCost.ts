import { getModelPrice } from '@lib/admin/pipelinePrices';
import type {
  PipelineCostRow,
  PipelinePhase,
  PipelineSessionCost,
} from '@lib/admin/pipelineTypes';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';

/** A session over this many tokens of context is re-reading a lot on every call. */
export const LONG_CONTEXT_TOKENS = 250_000;
/** What a session that started fresh at a natural break would have stayed under. */
export const FRESH_CONTEXT_TOKENS = 150_000;
/** The average context past which a session's "why" is its length rather than its phase. */
export const LONG_AVERAGE_CONTEXT_TOKENS = 200_000;
export const OPUS_BUILD_SHARE = 0.4;
export const OPUS_BUILD_MIN_USD = 20;
export const SCREENSHOT_SHARE = 0.25;
export const REVIEW_SHARE = 0.35;
export const MAX_SUGGESTIONS = 3;
export const TOP_SESSIONS = 5;
export const CHART_DAYS = 14;
export const LOAD_DAYS = 90;
export const CHANGES_LOOKBACK_DAYS = 60;
export const CHANGE_WINDOW_DAYS = 7;
export const CHANGE_MIN_SESSIONS = 3;

/** What a brief to an implementer runs on; the saving is the same tokens at its price. */
const SONNET_MODEL = 'claude-sonnet-5-5';
const DAY_MS = 86_400_000;
const MILLION = 1e6;

export const getDayKey = (ms: number) =>
  new Date(ms).toISOString().slice(0, 10);

export const addDays = (day: string, count: number) =>
  getDayKey(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS);

export const formatUsd = (usd: number) => formatCents(Math.round(usd * 100));

/** Whole dollars from $100 up, so a figure fits a three-across tile on a phone. */
export const formatTileUsd = (usd: number) =>
  usd >= 100 ? formatCentsShort(Math.round(usd) * 100) : formatUsd(usd);

/** 1.2M, 540k, 812. */
export function formatTokens(count: number): string {
  if (count >= 100 * MILLION) return `${Math.round(count / MILLION)}M`;
  if (count >= 999_500) return `${(count / MILLION).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(Math.round(count));
}

export const getRowTokens = (row: PipelineCostRow) =>
  row.input + row.cacheWrite5m + row.cacheWrite1h + row.cacheRead + row.output;

/** Dollars at list prices, or null for a model the price table doesn't know. */
export function getRowUsd(row: PipelineCostRow): number | null {
  const price = getModelPrice(row.model);
  if (!price) return null;
  return (
    (row.input * price.input +
      row.cacheWrite5m * price.input * 1.25 +
      row.cacheWrite1h * price.input * 2 +
      row.cacheRead * price.cacheRead +
      row.output * price.output) /
    MILLION
  );
}

const PHASE_LABELS: Record<PipelinePhase, string> = {
  planning: 'Planning',
  building: 'Building',
  investigating: 'Investigating',
  screenshots: 'Screenshots',
  review: 'Review and checks',
  checks: 'Review and checks',
  conversation: 'Conversation',
};

export const getPhaseLabel = (phase: PipelinePhase) => PHASE_LABELS[phase];

/** "Opus 5.5" from "claude-opus-5-5-20261001"; an id it can't read is shown as it is. */
export function getModelName(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/.exec(model);
  if (!match) return model;
  const [, family = '', major = '', minor] = match;
  const name = family.charAt(0).toUpperCase() + family.slice(1);
  return `${name} ${major}${minor ? `.${minor}` : ''}`;
}

interface Entry {
  session: PipelineSessionCost;
  row: PipelineCostRow;
  usd: number | null;
  tokens: number;
}

/** Every row dated within the days `from` to `to` (inclusive, UTC). */
const collect = (
  sessions: PipelineSessionCost[],
  from: string,
  to: string,
): Entry[] =>
  sessions.flatMap((session) =>
    session.rows
      .filter((row) => row.day >= from && row.day <= to)
      .map((row) => ({
        session,
        row,
        usd: getRowUsd(row),
        tokens: getRowTokens(row),
      })),
  );

const sumUsd = (entries: Entry[]) =>
  entries.reduce((sum, entry) => sum + (entry.usd ?? 0), 0);

export interface CostTotals {
  usd: number;
  tokens: number;
  sessions: number;
  /** Tokens on a model the price table doesn't know: counted, but not in `usd`. */
  unpricedTokens: number;
}

export function getTotals(
  sessions: PipelineSessionCost[],
  from: string,
  to: string,
): CostTotals {
  const entries = collect(sessions, from, to);
  return {
    usd: sumUsd(entries),
    tokens: entries.reduce((sum, entry) => sum + entry.tokens, 0),
    sessions: new Set(entries.map((entry) => entry.session.sessionId)).size,
    unpricedTokens: entries
      .filter((entry) => entry.usd === null)
      .reduce((sum, entry) => sum + entry.tokens, 0),
  };
}

export interface PeriodTotals {
  today: CostTotals;
  week: CostTotals;
  month: CostTotals;
}

export const getPeriodTotals = (
  sessions: PipelineSessionCost[],
  today: string,
): PeriodTotals => ({
  today: getTotals(sessions, today, today),
  week: getTotals(sessions, addDays(today, -6), today),
  month: getTotals(sessions, addDays(today, -29), today),
});

export interface DayBar {
  day: string;
  usd: number;
}

export function getDailyBars(
  sessions: PipelineSessionCost[],
  today: string,
  count = CHART_DAYS,
): DayBar[] {
  const from = addDays(today, -(count - 1));
  const entries = collect(sessions, from, today);
  return Array.from({ length: count }, (_, index) => {
    const day = addDays(from, index);
    return {
      day,
      usd: sumUsd(entries.filter((entry) => entry.row.day === day)),
    };
  });
}

export interface Slice {
  id: string;
  label: string;
  usd: number;
  tokens: number;
  /** Share of the dollars (0 to 1); 0 when nothing has a price. */
  share: number;
}

function toSlices(
  entries: Entry[],
  getKey: (entry: Entry) => { id: string; label: string },
): Slice[] {
  const groups = entries.reduce<Map<string, Slice>>((found, entry) => {
    const { id, label } = getKey(entry);
    const slice = found.get(id) ?? { id, label, usd: 0, tokens: 0, share: 0 };
    return new Map(found).set(id, {
      ...slice,
      usd: slice.usd + (entry.usd ?? 0),
      tokens: slice.tokens + entry.tokens,
    });
  }, new Map());
  const total = sumUsd(entries);
  return [...groups.values()]
    .map((slice) => ({ ...slice, share: total > 0 ? slice.usd / total : 0 }))
    .sort((a, b) => b.usd - a.usd || b.tokens - a.tokens);
}

export interface Breakdowns {
  phases: Slice[];
  apps: Slice[];
  models: Slice[];
  /** Tokens on a model without a price, across the same days. */
  unpricedTokens: number;
}

export function getBreakdowns(
  sessions: PipelineSessionCost[],
  today: string,
  getAppName: (appId: string | null) => string,
): Breakdowns {
  const entries = collect(sessions, addDays(today, -29), today);
  return {
    phases: toSlices(entries, ({ row }) => {
      const label = getPhaseLabel(row.phase);
      return { id: label, label };
    }),
    apps: toSlices(entries, ({ session }) => ({
      id: session.app ?? '',
      label: getAppName(session.app),
    })),
    models: toSlices(entries, ({ row }) => ({
      id: row.model,
      label: getModelName(row.model),
    })),
    unpricedTokens: entries
      .filter((entry) => entry.usd === null)
      .reduce((sum, entry) => sum + entry.tokens, 0),
  };
}

interface MainThread {
  model: string;
  calls: number;
  averageContext: number;
}

/** The session's own conversation, on the model it made most calls with. */
function getMainThread(entries: Entry[]): MainThread | null {
  const byModel = entries
    .filter(({ row }) => !row.isHelper)
    .reduce<Map<string, { calls: number; context: number }>>(
      (found, { row }) => {
        const before = found.get(row.model) ?? { calls: 0, context: 0 };
        return new Map(found).set(row.model, {
          calls: before.calls + row.calls,
          context:
            before.context +
            row.input +
            row.cacheWrite5m +
            row.cacheWrite1h +
            row.cacheRead,
        });
      },
      new Map(),
    );
  const [top] = [...byModel.entries()].sort((a, b) => b[1].calls - a[1].calls);
  if (!top || top[1].calls <= 0) return null;
  return {
    model: top[0],
    calls: top[1].calls,
    averageContext: top[1].context / top[1].calls,
  };
}

export const formatLongConversation = (calls: number, contextTokens: number) =>
  `Long conversation: ${calls.toLocaleString('en-US')} calls so far, each now re-reading about ${formatTokens(contextTokens)} tokens`;

export interface Suggestion {
  id: string;
  /** The branch it is about, when it is about one session. */
  subject: string | null;
  url: string | null;
  what: string;
  todo: string;
  savingUsd: number | null;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

function getLongSessionSuggestions(
  sessions: PipelineSessionCost[],
  from: string,
  to: string,
): Suggestion[] {
  return sessions
    .filter((session) => session.contextTokens > LONG_CONTEXT_TOKENS)
    .flatMap((session) => {
      const main = getMainThread(collect([session], from, to));
      if (!main) return [];
      const price = getModelPrice(main.model);
      const extraTokens = Math.max(
        0,
        main.averageContext - FRESH_CONTEXT_TOKENS,
      );
      const savingUsd = price
        ? (main.calls * extraTokens * price.cacheRead) / MILLION
        : null;
      return [
        {
          id: `long-${session.sessionId}`,
          subject: session.branch,
          url: session.url,
          what: formatLongConversation(session.calls, session.contextTokens),
          todo:
            savingUsd !== null && savingUsd >= 0.01
              ? `Start fresh at a natural break; a session that stayed under ${formatTokens(FRESH_CONTEXT_TOKENS)} would have cost about ${formatUsd(savingUsd)} less`
              : 'Start fresh at a natural break',
          savingUsd,
        },
      ];
    });
}

/** What is worth changing, from the last 7 days: the biggest saving first, at most three. */
export function getSuggestions(
  sessions: PipelineSessionCost[],
  today: string,
): Suggestion[] {
  const from = addDays(today, -6);
  const week = collect(sessions, from, today);
  const weekUsd = sumUsd(week);
  const building = week.filter((entry) => entry.row.phase === 'building');
  const buildingUsd = sumUsd(building);
  const opusBuilding = building.filter((entry) =>
    entry.row.model.includes('opus'),
  );
  const opusUsd = sumUsd(opusBuilding);
  const asSonnetUsd = opusBuilding.reduce(
    (sum, { row }) => sum + (getRowUsd({ ...row, model: SONNET_MODEL }) ?? 0),
    0,
  );
  const screenshotsUsd = sumUsd(
    week.filter((entry) => entry.row.phase === 'screenshots'),
  );
  const reviewUsd = sumUsd(
    week.filter(
      (entry) => entry.row.phase === 'review' || entry.row.phase === 'checks',
    ),
  );

  const candidates: Suggestion[] = [
    ...getLongSessionSuggestions(sessions, from, today),
    ...(buildingUsd > 0 &&
    opusUsd > OPUS_BUILD_MIN_USD &&
    opusUsd / buildingUsd > OPUS_BUILD_SHARE
      ? [
          {
            id: 'opus-building',
            subject: null,
            url: null,
            what: `Opus did ${percent(opusUsd / buildingUsd)} of the building (${formatUsd(opusUsd)} this week)`,
            todo:
              opusUsd - asSonnetUsd >= 0.01
                ? `Brief implementers (Sonnet) for long edit loops; the same work on Sonnet is about ${formatUsd(opusUsd - asSonnetUsd)} less`
                : 'Brief implementers (Sonnet) for long edit loops',
            savingUsd: Math.max(0, opusUsd - asSonnetUsd),
          },
        ]
      : []),
    ...(weekUsd > 0 && screenshotsUsd / weekUsd > SCREENSHOT_SHARE
      ? [
          {
            id: 'screenshots',
            subject: null,
            url: null,
            what: `Screenshots took ${percent(screenshotsUsd / weekUsd)} of the week (${formatUsd(screenshotsUsd)})`,
            todo: 'Take them once on the finished screen, not after every change',
            savingUsd: null,
          },
        ]
      : []),
    ...(weekUsd > 0 && reviewUsd / weekUsd > REVIEW_SHARE
      ? [
          {
            id: 'review',
            subject: null,
            url: null,
            what: `Review and checks took ${percent(reviewUsd / weekUsd)} of the week (${formatUsd(reviewUsd)})`,
            todo: 'Review the finished change once, and keep small tweaks to the quick checks',
            savingUsd: null,
          },
        ]
      : []),
  ];

  return candidates
    .sort((a, b) => (b.savingUsd ?? -1) - (a.savingUsd ?? -1))
    .slice(0, MAX_SUGGESTIONS);
}

export interface TopSession {
  sessionId: string;
  branch: string | null;
  app: string | null;
  url: string | null;
  usd: number;
  tokens: number;
  why: string;
}

export function getTopSessions(
  sessions: PipelineSessionCost[],
  today: string,
): TopSession[] {
  const entries = collect(sessions, addDays(today, -29), today);
  return sessions
    .map((session) => {
      const own = entries.filter(
        (entry) => entry.session.sessionId === session.sessionId,
      );
      const main = getMainThread(own);
      const [topPhase] = toSlices(own, ({ row }) => {
        const label = getPhaseLabel(row.phase);
        return { id: label, label };
      });
      return {
        sessionId: session.sessionId,
        branch: session.branch,
        app: session.app,
        url: session.url,
        usd: sumUsd(own),
        tokens: own.reduce((sum, entry) => sum + entry.tokens, 0),
        why:
          session.contextTokens > LONG_CONTEXT_TOKENS ||
          (main && main.averageContext > LONG_AVERAGE_CONTEXT_TOKENS)
            ? formatLongConversation(session.calls, session.contextTokens)
            : `Mostly ${(topPhase?.label ?? 'conversation').toLowerCase()}`,
      };
    })
    .filter((session) => session.tokens > 0)
    .sort((a, b) => b.usd - a.usd || b.tokens - a.tokens)
    .slice(0, TOP_SESSIONS);
}

export interface LogRow {
  date: string;
  scope: string;
  change: string;
  outcome: string;
}

/** The pipeline log's table rows, newest first as written. */
export function parsePipelineLog(markdown: string): LogRow[] {
  return markdown
    .split('\n')
    .filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line))
    .flatMap((line) => {
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim());
      const [date, scope, , change, , outcome] = cells;
      if (!date || !scope || !change || !outcome) return [];
      return [
        {
          date,
          scope,
          change: change.replace(/`/g, ''),
          outcome,
        },
      ];
    });
}

export interface ChangeEffect {
  date: string;
  /** Every change logged that day, newest first: they share one before and after. */
  changes: string[];
  before: number;
  after: number;
}

const getPerSession = (
  sessions: PipelineSessionCost[],
  from: string,
  to: string,
) => {
  const totals = getTotals(sessions, from, to);
  return totals.sessions >= CHANGE_MIN_SESSIONS
    ? totals.usd / totals.sessions
    : null;
};

/** Average dollars per session in the week before a shared pipeline change and the week after it; a change without three sessions on both sides is left out. */
export function getChangeEffects(
  sessions: PipelineSessionCost[],
  log: LogRow[],
  today: string,
): ChangeEffect[] {
  const earliest = addDays(today, -CHANGES_LOOKBACK_DAYS);
  return log
    .filter(
      (row) =>
        row.scope === 'shared' &&
        (row.outcome === 'changed' || row.outcome === 'added') &&
        row.date >= earliest &&
        row.date <= today,
    )
    .reduce<{ date: string; changes: string[] }[]>((days, row) => {
      const last = days.at(-1);
      return last?.date === row.date
        ? [
            ...days.slice(0, -1),
            { ...last, changes: [...last.changes, row.change] },
          ]
        : [...days, { date: row.date, changes: [row.change] }];
    }, [])
    .flatMap(({ date, changes }) => {
      const before = getPerSession(
        sessions,
        addDays(date, -CHANGE_WINDOW_DAYS),
        addDays(date, -1),
      );
      const after = getPerSession(
        sessions,
        addDays(date, 1),
        addDays(date, CHANGE_WINDOW_DAYS),
      );
      if (before === null || after === null) return [];
      return [{ date, changes, before, after }];
    });
}

/** The list prices (dollars per million tokens) of every model the sessions used, for the "How it's counted" table. */
export function getPriceTable(sessions: PipelineSessionCost[]) {
  const models = [
    ...new Set(sessions.flatMap((session) => session.rows.map((r) => r.model))),
  ];
  const named = models.flatMap((model) => {
    const price = getModelPrice(model);
    return price ? [{ name: getModelName(model), ...price }] : [];
  });
  return [...new Map(named.map((entry) => [entry.name, entry])).values()];
}
