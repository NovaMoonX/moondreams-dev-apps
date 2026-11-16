import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import type {
  LearnDeclineReason,
  LearnOffer,
  OpenResearch,
  Research,
  ResearchMode,
  ResearchOverview,
  ResearchSealed,
  ResearchStatus,
  ResearchVideo,
} from '@apps/helm/types';

const RESEARCH_SHOWN = 50;

const MODES: ResearchMode[] = ['asked', 'learnLater', 'leadTime'];
const STATUSES: ResearchStatus[] = [
  'planned',
  'asking',
  'preparing',
  'ready',
  'offered',
  'done',
  'dismissed',
];

const numberOrNull = (value: unknown) =>
  typeof value === 'number' ? value : null;
const stringOrNull = (value: unknown) =>
  typeof value === 'string' ? value : null;
const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((one): one is string => typeof one === 'string')
    : [];

const toOverview = (value: unknown): ResearchOverview | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<ResearchOverview>;
  const comparison = data.comparison;
  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    sections: Array.isArray(data.sections)
      ? data.sections.map((section) => ({
          heading: typeof section?.heading === 'string' ? section.heading : '',
          points: strings(section?.points),
        }))
      : [],
    comparison:
      comparison && Array.isArray(comparison.rows)
        ? {
            columns: strings(comparison.columns),
            rows: comparison.rows.map((row) => strings(row)),
          }
        : null,
    form:
      data.form === 'comparison' ||
      data.form === 'steps' ||
      data.form === 'points'
        ? data.form
        : null,
  };
};

const toSources = (value: unknown): ResearchSealed['sources'] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((one) => {
    const url = typeof one?.url === 'string' ? one.url : '';
    if (!url.startsWith('https://') || seen.has(url)) return [];
    seen.add(url);
    return [
      {
        title: typeof one.title === 'string' ? one.title : url,
        url,
        site: typeof one.site === 'string' ? one.site : '',
      },
    ];
  });
};

const REASONS: LearnDeclineReason[] = ['timing', 'lostInterest', 'changedMind'];

const toOffers = (value: unknown): LearnOffer[] =>
  Array.isArray(value)
    ? value.flatMap((one) =>
        typeof one?.at === 'number' &&
        (one.outcome === 'yes' || one.outcome === 'notNow')
          ? [
              {
                at: one.at,
                dayKind:
                  one.dayKind === 'weekday' || one.dayKind === 'weekend'
                    ? one.dayKind
                    : null,
                gapMinutes: numberOrNull(one.gapMinutes),
                afterBusyDay:
                  typeof one.afterBusyDay === 'boolean'
                    ? one.afterBusyDay
                    : null,
                outcome: one.outcome,
              },
            ]
          : [],
      )
    : [];

const toRelated = (value: unknown): Record<string, number> =>
  value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value).filter(
          (pair): pair is [string, number] => typeof pair[1] === 'number',
        ),
      )
    : {};

const toVideos = (value: unknown): ResearchVideo[] =>
  Array.isArray(value)
    ? value.flatMap((one) =>
        typeof one?.videoId === 'string' && one.videoId !== ''
          ? [
              {
                videoId: one.videoId,
                title: typeof one.title === 'string' ? one.title : '',
                channel: typeof one.channel === 'string' ? one.channel : '',
                durationSec: numberOrNull(one.durationSec) ?? 0,
              },
            ]
          : [],
      )
    : [];

/** A research item that won't open is kept with no words, so a screen never draws it. */
async function openResearch(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenResearch> {
  const data = entry.data() as Partial<Research> & { sealed?: unknown };
  const base: Omit<OpenResearch, keyof ResearchSealed> = {
    id: entry.id,
    mode: MODES.find((one) => one === data.mode) ?? 'asked',
    status: STATUSES.find((one) => one === data.status) ?? 'dismissed',
    captureId: stringOrNull(data.captureId),
    projectId: stringOrNull(data.projectId),
    depth:
      data.depth === 'light' || data.depth === 'thorough' ? data.depth : null,
    isWithoutWeb: data.isWithoutWeb === true,
    reservedCents: numberOrNull(data.reservedCents) ?? 0,
    searchesUsed: numberOrNull(data.searchesUsed) ?? 0,
    costCents: numberOrNull(data.costCents) ?? 0,
    rerunOn: numberOrNull(data.rerunOn),
    startedAt: numberOrNull(data.startedAt),
    preparedAt: numberOrNull(data.preparedAt),
    cancelledAt: numberOrNull(data.cancelledAt),
    createdAt: numberOrNull(data.createdAt) ?? 0,
    lastEditedAt: numberOrNull(data.lastEditedAt),
    prepareAt: numberOrNull(data.prepareAt),
    needsLiveFacts: data.needsLiveFacts === true,
    notNowStreak: numberOrNull(data.notNowStreak) ?? 0,
    declineReason: REASONS.find((one) => one === data.declineReason) ?? null,
    offeredOn: stringOrNull(data.offeredOn),
    offers: toOffers(data.offers),
    relatedOfferedAt: toRelated(data.relatedOfferedAt),
    mergedInto: stringOrNull(data.mergedInto),
    videosFetchedAt: numberOrNull(data.videosFetchedAt),
    prepareFailedAt: numberOrNull(data.prepareFailedAt),
    resultNoteId: stringOrNull(data.resultNoteId),
    removedAt: numberOrNull(data.removedAt),
    isUnreadable: false,
  };
  try {
    if (!data.sealed) throw new Error('This research has no sealed words.');
    const payload = await read<Partial<ResearchSealed>>(data.sealed as never);
    return {
      ...base,
      question: typeof payload.question === 'string' ? payload.question : '',
      subject: typeof payload.subject === 'string' ? payload.subject : '',
      overview: toOverview(payload.overview),
      sources: toSources(payload.sources),
      moreAsked: strings(payload.moreAsked),
      videos: toVideos(payload.videos),
      searchQuery: stringOrNull(payload.searchQuery),
      contextLine: stringOrNull(payload.contextLine),
    };
  } catch {
    return {
      ...base,
      question: '',
      subject: '',
      overview: null,
      sources: [],
      moreAsked: [],
      videos: [],
      searchQuery: null,
      contextLine: null,
      isUnreadable: true,
    };
  }
}

/** The person's latest research items, newest first. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startResearchListener(
  uid: string,
  read: SealedReader,
  onChange: (items: OpenResearch[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const run = { isStopped: false, sequence: 0 };
  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'research'),
      orderBy('createdAt', 'desc'),
      limit(RESEARCH_SHOWN),
    ),
    async (snapshot) => {
      run.sequence += 1;
      const current = run.sequence;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openResearch(entry, read)),
      );
      if (current !== run.sequence || run.isStopped) return;
      onChange(opened);
    },
    (error) =>
      onError(
        error instanceof Error
          ? error
          : new Error('Your research did not open.'),
      ),
  );
  return () => {
    run.isStopped = true;
    stop();
  };
}
