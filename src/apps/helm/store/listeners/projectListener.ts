import {
  collection,
  limit,
  onSnapshot,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { PROJECTS_LIMIT } from '@apps/helm/constants';
import { readPlace } from '@apps/helm/engine/importance';
import type {
  AheadOfferMeta,
  LeadAnswer,
  LeadQuestion,
} from '@apps/helm/engine/researchAhead';
import type {
  AheadAsk,
  OpenProject,
  Project,
  ProjectRole,
  ProjectSealed,
} from '@apps/helm/types';
import type { GoalWhy } from '@apps/helm/utils/goalWhy';
import { readPrivacy } from '@apps/helm/utils/privacy';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your projects did not open.');

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const isString = (value: unknown): value is string => typeof value === 'string';

const toWhy = (value: unknown): GoalWhy | null => {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isString(raw.verbatim)) return null;
  const state = raw.cleanedState;
  return {
    verbatim: raw.verbatim,
    cleaned: isString(raw.cleaned) ? raw.cleaned : null,
    cleanedState:
      state === 'offered' || state === 'accepted' || state === 'declined'
        ? state
        : null,
    summary: isString(raw.summary) ? raw.summary : null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter(isString) : [],
    basedOn: isString(raw.basedOn) ? raw.basedOn : '',
    saidAt: typeof raw.saidAt === 'number' ? raw.saidAt : 0,
    editedAt: typeof raw.editedAt === 'number' ? raw.editedAt : null,
    captureId: isString(raw.captureId) ? raw.captureId : null,
  };
};

const isRole = (value: unknown): value is ProjectRole =>
  value === 'key' || value === 'involved' || value === 'mentioned';

const toRoles = (value: unknown): Record<string, ProjectRole> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(([, role]) => isRole(role)),
      )
    : {};

const toNotes = (value: unknown): Record<string, string> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

const toMilestones = (value: unknown): Record<string, { title: string }> =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          ([, entry]) =>
            typeof (entry as { title?: unknown })?.title === 'string',
        ),
      )
    : {};

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** An entry missing a field or holding a non-finite number is skipped, so a half-written one never shows. */
const toMilestoneState = (value: unknown): Project['milestoneState'] =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, entry]) => {
          const { date, order, doneAt } = (entry ?? {}) as Record<
            string,
            unknown
          >;
          return (date === null || isNumber(date)) &&
            isNumber(order) &&
            (doneAt === null || isNumber(doneAt))
            ? [[id, { date, order, doneAt }]]
            : [];
        }),
      )
    : {};

const toOffer = (value: unknown): AheadOfferMeta[] => {
  const raw = (value ?? {}) as Record<string, unknown>;
  const state = raw.state;
  return isString(raw.id) &&
    isNumber(raw.leadDays) &&
    (state === 'waiting' || state === 'taken' || state === 'off')
    ? [
        {
          id: raw.id,
          leadDays: raw.leadDays,
          offerOn: isNumber(raw.offerOn) ? raw.offerOn : null,
          state,
          declineCount: isNumber(raw.declineCount) ? raw.declineCount : 0,
          nextEligibleOn: isNumber(raw.nextEligibleOn)
            ? raw.nextEligibleOn
            : null,
          shownOn: isString(raw.shownOn) ? raw.shownOn : null,
          researchId: isString(raw.researchId) ? raw.researchId : null,
          toldAt: isNumber(raw.toldAt) ? raw.toldAt : null,
          createdAt: isNumber(raw.createdAt) ? raw.createdAt : 0,
        },
      ]
    : [];
};

const toOffers = (value: unknown): AheadOfferMeta[] =>
  Array.isArray(value) ? value.flatMap(toOffer) : [];

const toQuestion = (value: unknown): LeadQuestion[] => {
  const raw = (value ?? {}) as Record<string, unknown>;
  const shape = raw.shape;
  return isString(raw.id) &&
    isString(raw.label) &&
    (shape === 'text' ||
      shape === 'pickOne' ||
      shape === 'pickMany' ||
      shape === 'amountRange')
    ? [
        {
          id: raw.id,
          label: raw.label,
          shape,
          options: Array.isArray(raw.options)
            ? raw.options.filter(isString)
            : [],
          prefill: Array.isArray(raw.prefill)
            ? raw.prefill.filter(isString)
            : [],
          from: isString(raw.from) ? raw.from : null,
          isInferred: raw.isInferred === true,
        },
      ]
    : [];
};

const toAnswer = (value: unknown): LeadAnswer[] => {
  const raw = (value ?? {}) as Record<string, unknown>;
  if (raw.kind === 'skipped') return [{ kind: 'skipped' }];
  if (raw.kind === 'text' && isString(raw.text))
    return [{ kind: 'text', text: raw.text }];
  if (raw.kind === 'picks' && Array.isArray(raw.picks))
    return [{ kind: 'picks', picks: raw.picks.filter(isString) }];
  if (raw.kind === 'range')
    return [
      {
        kind: 'range',
        minCents: isNumber(raw.minCents) ? raw.minCents : null,
        maxCents: isNumber(raw.maxCents) ? raw.maxCents : null,
      },
    ];
  return [];
};

const toAsk = (value: unknown): AheadAsk | null => {
  const raw = (value ?? {}) as Record<string, unknown>;
  if (!isString(raw.subject) || !isString(raw.question)) return null;
  const answers =
    typeof raw.answers === 'object' && raw.answers !== null
      ? Object.fromEntries(
          Object.entries(raw.answers).flatMap(([id, answer]) =>
            toAnswer(answer).map((read) => [id, read]),
          ),
        )
      : null;
  return {
    subject: raw.subject,
    question: raw.question,
    whyNow: isString(raw.whyNow) ? raw.whyNow : null,
    isDecision: raw.isDecision === true,
    questions: Array.isArray(raw.questions)
      ? raw.questions.flatMap(toQuestion)
      : [],
    answers,
    brief: isString(raw.brief) ? raw.brief : null,
  };
};

const toAsks = (value: unknown): Record<string, AheadAsk> | null => {
  if (typeof value !== 'object' || value === null) return null;
  const entries = Object.entries(value).flatMap(([id, ask]) => {
    const read = toAsk(ask);
    return read ? [[id, read] as const] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const toStatus = (value: unknown): Project['status'] =>
  value === 'finished' || value === 'paused' ? value : 'active';

/** A project that won't open is kept, with no name, so the surface can say so instead of dropping it. */
async function openProject(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenProject> {
  const data = entry.data() as Partial<Project>;
  const base = {
    id: entry.id,
    targetDate: data.targetDate ?? null,
    kind: data.kind === 'goal' ? 'goal' : 'project',
    status: toStatus(data.status),
    pausedAt: data.pausedAt ?? null,
    pausedUntil: data.pausedUntil ?? null,
    milestoneState: toMilestoneState(data.milestoneState),
    whoRoles: toRoles(data.whoRoles),
    mediaIds: data.mediaIds ?? [],
    createdBy: data.createdBy ?? 'nomos',
    executionId: data.executionId ?? null,
    createdAt: data.createdAt ?? 0,
    privacy: readPrivacy(data.privacy),
    lastEditedAt: data.lastEditedAt ?? null,
    finishedAt: data.finishedAt ?? null,
    researchOffers: toOffers(data.researchOffers),
  } as const;
  try {
    if (!data.sealed) throw new Error('This project has no sealed words.');
    const payload = await read<Partial<ProjectSealed>>(data.sealed);
    return {
      ...base,
      name: toText(payload.name) ?? '',
      emoji: toText(payload.emoji),
      objective: toText(payload.objective),
      milestones: toMilestones(payload.milestones),
      roleNotes: toNotes(payload.roleNotes),
      why: toWhy(payload.why),
      importance: readPlace(payload.importance),
      privateMark: payload.privateMark ?? null,
      isPrivacyCleared: payload.isPrivacyCleared ?? false,
      aheadAsks: toAsks(payload.aheadAsks),
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      name: '',
      emoji: null,
      objective: null,
      milestones: {},
      roleNotes: {},
      why: null,
      importance: null,
      isUnreadable: true,
      privateMark: null,
      isPrivacyCleared: false,
      aheadAsks: null,
    };
  }
}

/** Every project the person has. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startProjectsListener(
  uid: string,
  read: SealedReader,
  onChange: (projects: OpenProject[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'projects'),
      limit(PROJECTS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openProject(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
