import { createHash } from 'node:crypto';

import {
  FieldValue,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type { BatchResult } from '../../../ai/batch.js';
import { getUsageCost } from '../../../ai/models.js';
import type { Keyring } from '../../../appKeys/keyring.js';
import { recordAiSpendIn } from '../aiLimits.js';
import { whyFingerprint } from '../goalWhy.js';
import { isPrivateHabit } from '../habitStore.js';
import { sealForHelm, unwrapHelmKey, type HelmKey } from '../helmKey.js';
import { toKnownZone } from '../nomos/spoken.js';
import { maskOthersHealth, SAID_SIGNAL_DAYS } from '../nomos/said.js';
import { readDerivedPrivacy, type PrivacyClass } from '../privacy.js';
import { buildAliasIndex } from './buildReflectRequest.js';
import {
  normalizeReflection,
  type NormalizedReflection,
} from './normalizeReflection.js';
import { readReflectWindow, type ReflectWindow } from './readReflectWindow.js';
import { planSeeYouIn, type SeeYouPlan } from './seeYou.js';
import {
  readRun,
  readState,
  releaseLeaseIn,
  RUNS_PATH,
  statePath,
  REFLECT_BATCH,
  type ReflectionRun,
  type ReflectionState,
  type RunRequest,
} from './reflectionRuns.js';

export type ReflectionResult =
  'written' | 'dropped' | 'skipped' | 'failed' | 'gaveUp';

const MAX_SOURCE_KEYS = 120;
const QUOTE_CAP = 200;
const MIN_CITED = 3;

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

const habitOfKey = (sourceKey: string) =>
  sourceKey.match(/#([^/]+)\//)?.[1] ?? null;

interface Planned {
  reflection: DocumentData;
  observations: { id: string; data: DocumentData }[];
}

const findInNote = (text: string, quote: string) => {
  const at = text.toLowerCase().indexOf(quote.toLowerCase());
  return at === -1 ? null : text.slice(at, at + quote.length);
};

interface PlanInput {
  uid: string;
  customId: string;
  dayKey: string;
  now: number;
  key: HelmKey;
  window: ReflectWindow;
  result: NormalizedReflection;
}

/** The note observations to make, each with a quote found in its note by code; the model's own words are never kept. */
function planNoteObservations({
  uid,
  now,
  key,
  window,
  result,
}: PlanInput): { id: string; data: DocumentData }[] {
  const habitIndex = buildAliasIndex('h', uid, [...window.habits.keys()]);
  const observed = new Set(window.observations.flatMap((o) => o.sourceKeys));
  return result.noteObservations.flatMap((entry) => {
    const habitId = habitIndex.get(entry.about) ?? null;
    const habit = habitId === null ? undefined : window.habits.get(habitId);
    if (habitId === null || !habit || isPrivateHabit(habit) || !entry.quote)
      return [];
    const found = window.notes
      .filter(
        (note) => note.habitId === habitId && note.dayKey === entry.dayKey,
      )
      .flatMap((note) => {
        const quote = findInNote(note.text, entry.quote ?? '');
        return quote === null ? [] : [{ note, quote }];
      })[0];
    if (!found) return [];
    const sourceKey = `habitDays/${found.note.dayKey}#${habitId}/${found.note.windowId}`;
    if (observed.has(sourceKey)) return [];
    const privacy: PrivacyClass = readDerivedPrivacy([sourceKey], () =>
      isPrivateHabit(habit) ? 'private' : 'ordinary',
    );
    return [
      {
        id: `ob_${hash(`note|${sourceKey}`).slice(0, 24)}`,
        data: {
          subject: { collection: 'habits', id: habitId },
          dayKey: found.note.dayKey,
          at: found.note.at,
          source: 'checkInNote',
          sourceKeys: [sourceKey],
          isCare: habit.isCare,
          writtenBy: 'reflection',
          createdAt: now,
          privacy,
          sealed: sealForHelm(key, {
            kind: entry.kind,
            tags: entry.tags,
            quote: maskOthersHealth(
              found.quote.slice(0, QUOTE_CAP),
              window.whoNames,
            ),
          }),
        },
      },
    ];
  });
}

/** The reflection document and the observations it adds, from the model's answer checked against what the person's records hold now. */
export function planReflection(input: PlanInput): Planned {
  const { uid, customId, dayKey, now, key, window, result } = input;
  const habitIndex = buildAliasIndex('h', uid, [...window.habits.keys()]);
  const goalIndex = buildAliasIndex('g', uid, [...window.goals.keys()]);
  const observationIndex = buildAliasIndex(
    'o',
    uid,
    window.observations.map((o) => o.id),
  );
  const byId = new Map(window.observations.map((o) => [o.id, o]));
  const candidates = result.candidates.flatMap((candidate) => {
    const isHabit = candidate.subject.startsWith('h');
    const id =
      (isHabit ? habitIndex : goalIndex).get(candidate.subject) ?? null;
    const habit = isHabit && id !== null ? window.habits.get(id) : undefined;
    if (id === null || (isHabit ? !habit : !window.goals.has(id))) return [];
    const collection = isHabit ? 'habits' : 'projects';
    const cited = [
      ...new Set(candidate.observations.map((a) => observationIndex.get(a))),
    ].flatMap((obsId) => {
      const observation = obsId ? byId.get(obsId) : undefined;
      return observation &&
        observation.subject.collection === collection &&
        observation.subject.id === id
        ? [observation]
        : [];
    });
    const days = new Set(cited.map((o) => o.dayKey));
    const known = new Set(cited.flatMap((o) => o.tags));
    const tags = candidate.tags.filter((tag) => known.has(tag));
    if (
      cited.length < MIN_CITED ||
      days.size < SAID_SIGNAL_DAYS ||
      tags.length === 0
    )
      return [];
    const isCare =
      (habit !== undefined && isPrivateHabit(habit)) ||
      cited.some((o) => o.isCare);
    return [
      {
        collection,
        id,
        isPrivate: isCare || (window.goals.get(id)?.isPrivate ?? false),
        cited,
        sealed: {
          subject: { collection, id },
          observationIds: cited.map((o) => o.id),
          tags,
          linkedTo: candidate.linkedTo,
          suggestion: isCare ? ('none' as const) : candidate.suggestion,
        },
      },
    ];
  });
  const kept = candidates.filter(
    (candidate, index) =>
      candidates.findIndex(
        (other) =>
          other.collection === candidate.collection &&
          other.id === candidate.id,
      ) === index,
  );
  const whyRefresh = result.whyRefresh.flatMap((entry) => {
    const id = goalIndex.get(entry.goal) ?? null;
    const goal = id === null ? undefined : window.goals.get(id);
    return id !== null &&
      goal &&
      !goal.isPrivate &&
      goal.why &&
      goal.why.verbatim.trim() !== '' &&
      entry.basedOn === whyFingerprint(goal.why.verbatim)
      ? [
          {
            projectId: id,
            summary: entry.summary,
            tags: entry.tags,
            basedOn: entry.basedOn,
          },
        ]
      : [];
  });
  const observations = planNoteObservations(input);
  const citedKeys = kept.flatMap((candidate) =>
    candidate.cited.map((o) => `observations/${o.id}`),
  );
  const sourceKeys = [
    ...new Set([
      ...citedKeys,
      ...window.observations.map((o) => `observations/${o.id}`),
      ...observations.flatMap((o) => o.data.sourceKeys as string[]),
    ]),
  ].slice(0, MAX_SOURCE_KEYS);
  const classOf = (sourceKey: string): PrivacyClass => {
    const habitId = habitOfKey(sourceKey);
    const habit = habitId === null ? undefined : window.habits.get(habitId);
    if (habit) return isPrivateHabit(habit) ? 'private' : 'ordinary';
    return (
      byId.get(sourceKey.replace('observations/', ''))?.privacy ?? 'ordinary'
    );
  };
  return {
    observations,
    reflection: {
      dayKey,
      reflectionId: customId,
      candidateCount: kept.length,
      seenAt: null,
      sourceKeys,
      createdAt: now,
      privacy:
        readDerivedPrivacy(sourceKeys, classOf) === 'private' ||
        kept.some((candidate) => candidate.isPrivate)
          ? 'private'
          : 'ordinary',
      sealed: sealForHelm(key, {
        candidates: kept.map((candidate) => candidate.sealed),
        whyRefresh,
      }),
    },
  };
}

const isPlainObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const openKey = (firestore: Firestore, keyring: Keyring, uid: string) =>
  unwrapHelmKey(firestore, keyring, uid).catch((error: unknown) => {
    if (typeof (error as { code?: unknown } | null)?.code !== 'undefined')
      throw error;
    return null;
  });

export type Decision = 'superseded' | 'off' | 'forgotten' | 'failed' | 'write';

const toNumberOrNull = (value: unknown) =>
  typeof value === 'number' ? value : null;

export function decide(input: {
  run: ReflectionRun;
  customId: string;
  state: ReflectionState;
  profile: DocumentData | undefined;
  hasAnswer: boolean;
}): Decision {
  const { run, customId, state, profile } = input;
  if (
    run.superseded.includes(customId) ||
    state.customId !== customId ||
    !profile
  )
    return 'superseded';
  if (profile.isLearningOn === false) return 'off';
  const forgottenAt = toNumberOrNull(profile.forgottenAt);
  if (forgottenAt !== null && forgottenAt > (run.submittedAt ?? 0))
    return 'forgotten';
  return input.hasAnswer ? 'write' : 'failed';
}

/** Settles one request's answer in one transaction: the person's reflection and any note observations are written, or the answer is dropped (learning off, forgotten since it was sent, replaced by a newer request) or counted as a failed try. Running it again for the same request changes nothing. */
export async function applyReflectionOutcome(
  firestore: Firestore,
  keyring: Keyring,
  input: {
    runId: string;
    customId: string;
    result: BatchResult;
    now: number;
  },
): Promise<ReflectionResult> {
  const { runId, customId, result: batchResult, now } = input;
  const runRef = firestore.doc(`${RUNS_PATH}/${runId}`);
  const request: RunRequest | undefined = readRun((await runRef.get()).data())
    ?.requests[customId];
  if (!request) return 'skipped';
  const { uid } = request;
  const answer =
    batchResult.outcome === 'succeeded' && isPlainObject(batchResult.output)
      ? normalizeReflection(batchResult.output)
      : null;
  const key = answer ? await openKey(firestore, keyring, uid) : null;
  const spent =
    batchResult.outcome === 'succeeded'
      ? getUsageCost('reflect', batchResult.usage, { isBatch: true })
      : 0;
  const base = `apps/helm/users/${uid}`;
  const profileRef = firestore.doc(base);
  const stateRef = firestore.doc(statePath(uid));
  const reflectionRef = firestore.doc(`${base}/reflections/${request.dayKey}`);

  return firestore.runTransaction<ReflectionResult>(async (transaction) => {
    const [runSnap, profileSnap, stateSnap, reflectionSnap] = await Promise.all(
      [
        transaction.get(runRef),
        transaction.get(profileRef),
        transaction.get(stateRef),
        transaction.get(reflectionRef),
      ],
    );
    const run = readRun(runSnap.data());
    const current = run?.requests[customId];
    if (!run || !current) return 'skipped';
    const state = readState(stateSnap.data());
    const profile = profileSnap.data();
    const decision = decide({
      run,
      customId,
      state,
      profile,
      hasAnswer: answer !== null && key !== null,
    });
    const window =
      decision === 'write' && answer && key && profile
        ? await readReflectWindow(
            (query) => transaction.get(query),
            firestore,
            uid,
            key,
            {
              timeZone: toKnownZone(String(profile.timeZone ?? 'UTC')),
              forgottenAt: toNumberOrNull(profile.forgottenAt),
            },
            current.dayKey,
          )
        : null;
    const planned =
      window && answer && key
        ? planReflection({
            uid,
            customId,
            dayKey: current.dayKey,
            now,
            key,
            window,
            result: answer,
          })
        : null;
    const isAlreadyWritten = reflectionSnap.data()?.reflectionId === customId;
    const seeYou: SeeYouPlan | null =
      window && answer?.seeYou && key && profile && !isAlreadyWritten
        ? await planSeeYouIn(transaction, firestore, {
            uid,
            now,
            key,
            window,
            lines: answer.seeYou,
            forgottenAt: toNumberOrNull(profile.forgottenAt),
          })
        : null;
    const existing =
      planned && planned.observations.length > 0
        ? await transaction.getAll(
            ...planned.observations.map((o) =>
              firestore.doc(`${base}/observations/${o.id}`),
            ),
          )
        : [];

    transaction.update(runRef, {
      [`requests.${customId}`]: FieldValue.delete(),
    });
    recordAiSpendIn(transaction, firestore, now, spent - current.reserved);
    if (decision === 'superseded') return 'skipped';
    const clearDue = () => {
      if (profile && profile.reflectDueAt === current.answersDueAt)
        transaction.update(profileRef, { reflectDueAt: null });
    };
    if (decision === 'off') {
      releaseLeaseIn(transaction, firestore, uid, 0, state.lastDayKey);
      return 'dropped';
    }
    if (decision === 'forgotten') {
      releaseLeaseIn(transaction, firestore, uid, 0, state.lastDayKey);
      clearDue();
      return 'dropped';
    }
    if (decision === 'failed') {
      const attempts = state.attempts + 1;
      const hasGivenUp = attempts >= REFLECT_BATCH.maxAttempts;
      releaseLeaseIn(
        transaction,
        firestore,
        uid,
        hasGivenUp ? 0 : attempts,
        state.lastDayKey,
      );
      if (!hasGivenUp) return 'failed';
      clearDue();
      logger.warn('helm.reflect.gaveUp', { attempts });
      return 'gaveUp';
    }
    releaseLeaseIn(
      transaction,
      firestore,
      uid,
      0,
      planned && !isAlreadyWritten ? current.dayKey : state.lastDayKey,
    );
    clearDue();
    if (!planned || isAlreadyWritten) return 'skipped';
    transaction.set(reflectionRef, {
      ...planned.reflection,
      seenAt:
        (reflectionSnap.get('seenAt') as number | null | undefined) ?? null,
    });
    planned.observations.forEach(({ id, data }, index) => {
      if (!existing[index]?.exists)
        transaction.set(firestore.doc(`${base}/observations/${id}`), data);
    });
    if (seeYou) {
      seeYou.creates.forEach(({ id, data }) =>
        transaction.set(firestore.doc(`${base}/seenAs/${id}`), data),
      );
      seeYou.updates.forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${base}/seenAs/${id}`), data),
      );
      seeYou.deletes.forEach((id) =>
        transaction.delete(firestore.doc(`${base}/seenAs/${id}`)),
      );
      transaction.update(profileRef, { seenAsRebuiltAt: now });
      logger.info('helm.reflect.seeYou', seeYou.counts);
    }
    return 'written';
  });
}
