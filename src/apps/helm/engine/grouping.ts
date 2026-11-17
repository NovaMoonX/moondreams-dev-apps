import { sha256Hex } from '@/utils/sha256';
import type { PrivacyClass } from '@apps/helm/utils/privacy';

const DAY_MS = 86_400_000;

export const GROUPING_STATES = [
  'proposed',
  'filed',
  'groupedByYou',
  'notRelated',
  'notNow',
] as const;
export type GroupingState = (typeof GROUPING_STATES)[number];

/** Strongest first. */
export const GROUPING_CONFIDENCE = ['certain', 'likely', 'unsure'] as const;
export type GroupingConfidence = (typeof GROUPING_CONFIDENCE)[number];

export const GROUPING_EVIDENCE = [
  'sharedWho',
  'sharedProject',
  'datedEvent',
  'titleMatch',
] as const;
export type GroupingEvidence = (typeof GROUPING_EVIDENCE)[number];

export const GROUPING_PARENT_KINDS = ['project', 'topic'] as const;
export type GroupingParentKind = (typeof GROUPING_PARENT_KINDS)[number];

export const GROUPING_LIMITS = {
  minSources: 2,
  maxSources: 12,
  records: 200,
} as const;

/** Weeks an offer waits after the first and second Not now; the third ends it. */
export const GROUPING_BACKOFF_WEEKS = [4, 8] as const;

/** Keys read `<collection>/<id>`. */
export const GROUPING_COLLECTIONS = [
  'tasks',
  'notes',
  'topics',
  'projects',
  'synced',
] as const;

export interface GroupingSource {
  key: string;
  app: string | null;
  kind: string;
}

export interface GroupingMeta {
  parentKind: GroupingParentKind;
  parentId: string | null;
  sourceKeys: string[];
  sources: GroupingSource[];
  /** Links this grouping wrote, for Undo and a deleted source. */
  linkedKeys: string[];
  state: GroupingState;
  confidence: GroupingConfidence;
  evidence: GroupingEvidence[];
  declineCount: number;
  nextOfferAfter: number | null;
  answeredAt: number | null;
  toldAt: number | null;
  executionId: string | null;
  dayKey: string;
  proposedAt: number;
  updatedAt: number;
  privacy: PrivacyClass | null;
  createdBy: 'nomos';
}

export type GroupingRecord = GroupingMeta & { id: string };

const uniqueSorted = (keys: readonly string[]) =>
  Array.from(new Set(keys)).sort();

/** Same sources, same id on any device or retry. */
export const toGroupingId = (uid: string, sourceKeys: readonly string[]) =>
  `g_${sha256Hex(`${uid}|${uniqueSorted(sourceKeys).join('|')}`).slice(0, 24)}`;

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const toInstant = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const pick = <T extends string>(list: readonly T[], value: unknown) =>
  list.find((item) => item === value) ?? null;

const readSource = (value: unknown): GroupingSource | null => {
  const raw = (value ?? {}) as Record<string, unknown>;
  return isString(raw.key)
    ? {
        key: raw.key,
        app: isString(raw.app) ? raw.app : null,
        kind: typeof raw.kind === 'string' ? raw.kind : '',
      }
    : null;
};

/** `null` when what makes it a grouping is missing. */
export function readGrouping(id: string, data: unknown): GroupingRecord | null {
  const raw = (data ?? {}) as Record<string, unknown>;
  const state = pick(GROUPING_STATES, raw.state);
  const parentKind = pick(GROUPING_PARENT_KINDS, raw.parentKind);
  const sourceKeys = Array.isArray(raw.sourceKeys)
    ? uniqueSorted(raw.sourceKeys.filter(isString)).slice(
        0,
        GROUPING_LIMITS.maxSources,
      )
    : [];
  if (!state || !parentKind || sourceKeys.length < GROUPING_LIMITS.minSources)
    return null;
  const sources = Array.isArray(raw.sources)
    ? raw.sources
        .map(readSource)
        .filter(
          (source): source is GroupingSource =>
            source !== null && sourceKeys.includes(source.key),
        )
    : [];
  return {
    id,
    parentKind,
    parentId: isString(raw.parentId) ? raw.parentId : null,
    sourceKeys,
    sources,
    linkedKeys: Array.isArray(raw.linkedKeys)
      ? raw.linkedKeys.filter(isString)
      : [],
    state,
    confidence: pick(GROUPING_CONFIDENCE, raw.confidence) ?? 'unsure',
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.flatMap((item) => pick(GROUPING_EVIDENCE, item) ?? [])
      : [],
    declineCount:
      typeof raw.declineCount === 'number' && raw.declineCount > 0
        ? Math.min(
            Math.floor(raw.declineCount),
            GROUPING_BACKOFF_WEEKS.length + 1,
          )
        : 0,
    nextOfferAfter: toInstant(raw.nextOfferAfter),
    answeredAt: toInstant(raw.answeredAt),
    toldAt: toInstant(raw.toldAt),
    executionId: isString(raw.executionId) ? raw.executionId : null,
    dayKey: typeof raw.dayKey === 'string' ? raw.dayKey : '',
    proposedAt: toInstant(raw.proposedAt) ?? 0,
    updatedAt: toInstant(raw.updatedAt) ?? 0,
    privacy: raw.privacy === 'private' ? 'private' : 'ordinary',
    createdBy: 'nomos',
  };
}

const liveCount = (grouping: GroupingMeta, liveKeys: ReadonlySet<string>) =>
  grouping.sourceKeys.filter((key) => liveKeys.has(key)).length;

const isOfferable = (
  grouping: GroupingMeta,
  now: number,
  liveKeys: ReadonlySet<string>,
) =>
  (grouping.state === 'proposed' || grouping.state === 'notNow') &&
  grouping.declineCount <= GROUPING_BACKOFF_WEEKS.length &&
  (grouping.nextOfferAfter === null || grouping.nextOfferAfter <= now) &&
  (grouping.state === 'proposed' || grouping.nextOfferAfter !== null) &&
  liveCount(grouping, liveKeys) >= GROUPING_LIMITS.minSources;

/** The one grouping to offer now; the surest first, then the newest. */
export function selectGroupingOffer<T extends GroupingRecord>(
  groupings: readonly T[],
  now: number,
  liveKeys: ReadonlySet<string>,
): T | null {
  const rank = (grouping: T) =>
    GROUPING_CONFIDENCE.indexOf(grouping.confidence);
  return (
    groupings
      .filter((grouping) => isOfferable(grouping, now, liveKeys))
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          b.proposedAt - a.proposedAt ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}

export interface GroupingNotNowPatch {
  state: 'notNow';
  declineCount: number;
  nextOfferAfter: number | null;
  answeredAt: number;
  updatedAt: number;
}

/** Waits 4 weeks, then 8; the third ends the offer. */
export function applyGroupingNotNow(
  grouping: Pick<GroupingMeta, 'declineCount'>,
  now: number,
): GroupingNotNowPatch {
  const declineCount = grouping.declineCount + 1;
  return {
    state: 'notNow',
    declineCount,
    nextOfferAfter:
      declineCount > GROUPING_BACKOFF_WEEKS.length
        ? null
        : now + GROUPING_BACKOFF_WEEKS[declineCount - 1] * 7 * DAY_MS,
    answeredAt: now,
    updatedAt: now,
  };
}

/** Whether a run brings a source the person has not answered about. */
export const isNewEvidence = (
  grouping: Pick<GroupingMeta, 'sourceKeys'>,
  sourceKeys: readonly string[],
) => sourceKeys.some((key) => !grouping.sourceKeys.includes(key));

/** What is left after a deleted source; `null` when the key was never in it. */
export function dropSource(
  grouping: Pick<GroupingMeta, 'sourceKeys' | 'sources' | 'linkedKeys'>,
  key: string,
): {
  patch: Pick<GroupingMeta, 'sourceKeys' | 'sources' | 'linkedKeys'>;
  isGone: boolean;
} | null {
  if (!grouping.sourceKeys.includes(key)) return null;
  const sourceKeys = grouping.sourceKeys.filter((item) => item !== key);
  return {
    patch: {
      sourceKeys,
      sources: grouping.sources.filter((source) => source.key !== key),
      linkedKeys: grouping.linkedKeys.filter((item) => item !== key),
    },
    isGone: sourceKeys.length < GROUPING_LIMITS.minSources,
  };
}
