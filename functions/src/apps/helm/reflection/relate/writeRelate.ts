import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type { BatchResult } from '../../../../ai/batch.js';
import { getUsageCost } from '../../../../ai/models.js';
import type { Keyring } from '../../../../appKeys/keyring.js';
import { recordAiSpendIn } from '../../aiLimits.js';
import { sealForHelm, unwrapHelmKey, type HelmKey } from '../../helmKey.js';
import { dropSource, type GroupingRecord } from '../../nomos/grouping.js';
import {
  readRun,
  readState,
  releaseLeaseIn,
  RUNS_PATH,
  statePath,
  type RunRequest,
} from '../reflectionRuns.js';
import { decide } from '../writeReflection.js';
import {
  buildRelateIndex,
  readRelateWorld,
  type RelateWorld,
} from './buildRelateRequest.js';
import { normalizeRelate } from './normalizeRelate.js';
import { planRelate, type PlannedGrouping } from './planRelate.js';
import { RELATE_BATCH } from './relateRuns.js';

export type RelateResult =
  'written' | 'dropped' | 'skipped' | 'failed' | 'gaveUp';

const isPlainObject = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const openKey = (firestore: Firestore, keyring: Keyring, uid: string) =>
  unwrapHelmKey(firestore, keyring, uid).catch((error: unknown) => {
    if (typeof (error as { code?: unknown } | null)?.code !== 'undefined')
      throw error;
    return null;
  });

interface Backstop {
  groupings: GroupingRecord[];
  edits: { id: string; isGone: boolean; patch: Partial<GroupingRecord> }[];
}

/** Drops gone sources from stored groupings; one missing only from tonight's read is looked up. */
async function dropGoneSources(
  firestore: Firestore,
  base: string,
  world: RelateWorld,
  read: (
    refs: ReturnType<Firestore['doc']>[],
  ) => Promise<{ exists: boolean; get: (field: string) => unknown }[]>,
): Promise<Backstop> {
  const inView = new Set(world.items.map((item) => item.key));
  const unseen = [
    ...new Set(
      world.groupings.flatMap((grouping) =>
        grouping.sourceKeys.filter((key) => !inView.has(key)),
      ),
    ),
  ];
  const snaps = unseen.length
    ? await read(unseen.map((key) => firestore.doc(`${base}/${key}`)))
    : [];
  const gone = new Set(
    unseen.filter((key, at) => {
      const snap = snaps[at];
      return (
        !snap?.exists ||
        (key.startsWith('synced/') && snap.get('connectionEndedAt') != null)
      );
    }),
  );
  return world.groupings.reduce<Backstop>(
    (acc, grouping) => {
      const dropped = [...gone]
        .filter((key) => grouping.sourceKeys.includes(key))
        .reduce<{
          record: GroupingRecord;
          isGone: boolean;
          isChanged: boolean;
        }>(
          (state, key) => {
            const result = dropSource(state.record, key);
            return result
              ? {
                  record: { ...state.record, ...result.patch },
                  isGone: state.isGone || result.isGone,
                  isChanged: true,
                }
              : state;
          },
          { record: grouping, isGone: false, isChanged: false },
        );
      if (!dropped.isChanged)
        return { ...acc, groupings: [...acc.groupings, grouping] };
      return {
        groupings: dropped.isGone
          ? acc.groupings
          : [...acc.groupings, dropped.record],
        edits: [
          ...acc.edits,
          {
            id: grouping.id,
            isGone: dropped.isGone,
            patch: {
              sourceKeys: dropped.record.sourceKeys,
              sources: dropped.record.sources,
              linkedKeys: dropped.record.linkedKeys,
            },
          },
        ],
      };
    },
    { groupings: [], edits: [] },
  );
}

const toExecution = (
  key: HelmKey,
  world: RelateWorld,
  planned: PlannedGrouping,
  now: number,
) => {
  const parentName =
    world.projects.get(planned.meta.parentId ?? '')?.name ?? 'a project';
  const links = planned.links.map((link) => ({
    ref: { op: 'update' as const, collection: link.collection, docId: link.id },
    effect: {
      written:
        link.collection === 'tasks'
          ? { projectId: link.projectId }
          : { projectIds: [link.projectId] },
      previous:
        link.collection === 'tasks' ? { projectId: null } : { projectIds: [] },
    },
  }));
  const grouping = {
    ref: {
      op: planned.isNew ? ('create' as const) : ('update' as const),
      collection: 'groupings' as const,
      docId: planned.id,
    },
    effect: {
      written: { state: 'filed', linkedKeys: planned.meta.linkedKeys },
      previous: planned.isNew ? null : { state: 'proposed', linkedKeys: [] },
    },
  };
  const all = [...links, grouping];
  const count = planned.meta.linkedKeys.length;
  return {
    captureId: null,
    actor: 'nomos',
    via: null,
    category: 'organize',
    autonomyLevel: 1,
    state: 'succeeded',
    effectRefs: all.map((entry) => entry.ref),
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    undoneDocIds: null,
    partUndoIds: null,
    questionRef: null,
    errorCode: null,
    privacy: 'ordinary',
    createdAt: now,
    decidedAt: now,
    finishedAt: now,
    sealed: sealForHelm(key, {
      summary: `Linked ${count} ${count === 1 ? 'thing' : 'things'} to ${parentName}.`,
      commands: [],
      effects: all.map((entry) => entry.effect),
      undoReport: null,
      spoken: null,
      goneIds: null,
      undoReason: null,
      said: null,
      lines: null,
      abilityOffer: null,
      awayZoneOffer: null,
    }),
  };
};

/** Settles one request's answer in one transaction; running it again changes nothing. */
export async function applyRelateOutcome(
  firestore: Firestore,
  keyring: Keyring,
  input: {
    runId: string;
    customId: string;
    result: BatchResult;
    now: number;
  },
): Promise<RelateResult> {
  const { runId, customId, result: batchResult, now } = input;
  const runRef = firestore.doc(`${RUNS_PATH}/${runId}`);
  const request: RunRequest | undefined = readRun((await runRef.get()).data())
    ?.requests[customId];
  if (!request) return 'skipped';
  const { uid } = request;
  const answer =
    batchResult.outcome === 'succeeded' && isPlainObject(batchResult.output)
      ? normalizeRelate(batchResult.output)
      : null;
  const key = answer ? await openKey(firestore, keyring, uid) : null;
  const spent =
    batchResult.outcome === 'succeeded'
      ? getUsageCost('reflect', batchResult.usage, { isBatch: true })
      : 0;
  const base = `apps/helm/users/${uid}`;
  const profileRef = firestore.doc(base);
  const stateRef = firestore.doc(statePath(uid, 'relate'));

  return firestore.runTransaction<RelateResult>(async (transaction) => {
    const [runSnap, profileSnap, stateSnap] = await Promise.all([
      transaction.get(runRef),
      transaction.get(profileRef),
      transaction.get(stateRef),
    ]);
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
    const world =
      decision === 'write' && key
        ? await readRelateWorld(
            (query) => transaction.get(query),
            firestore,
            uid,
            key,
            now,
          )
        : null;
    const backstop = world
      ? await dropGoneSources(firestore, base, world, (refs) =>
          transaction.getAll(...refs),
        )
      : null;
    const cleaned =
      world && backstop ? { ...world, groupings: backstop.groupings } : null;
    const index = cleaned ? buildRelateIndex(uid, cleaned) : null;
    const planWith = (executedIds: ReadonlySet<string>) =>
      cleaned && index && answer
        ? planRelate({
            uid,
            now,
            dayKey: current.dayKey,
            world: cleaned,
            index,
            answer,
            executedIds,
          })
        : null;
    const firstPlan = planWith(
      new Set(
        (cleaned?.groupings ?? []).flatMap((grouping) =>
          grouping.executionId === null ? [] : [grouping.id],
        ),
      ),
    );
    const filedIds = (firstPlan?.groupings ?? [])
      .filter((planned) => planned.meta.state === 'filed')
      .map((planned) => planned.id);
    const executionSnaps = filedIds.length
      ? await transaction.getAll(
          ...filedIds.map((id) =>
            firestore.doc(`${base}/executions/relate-${id}`),
          ),
        )
      : [];
    const alreadyExecuted = filedIds.filter(
      (_, at) => executionSnaps[at]?.exists,
    );
    const plan =
      alreadyExecuted.length === 0
        ? firstPlan
        : planWith(
            new Set([
              ...(cleaned?.groupings ?? []).flatMap((grouping) =>
                grouping.executionId === null ? [] : [grouping.id],
              ),
              ...alreadyExecuted,
            ]),
          );

    transaction.update(runRef, {
      [`requests.${customId}`]: FieldValue.delete(),
    });
    recordAiSpendIn(transaction, firestore, now, spent - current.reserved);
    if (decision === 'superseded') return 'skipped';
    const clearDue = () => {
      if (profile && profile.relateDueAt === current.answersDueAt)
        transaction.update(profileRef, { relateDueAt: null });
    };
    if (decision === 'off') {
      releaseLeaseIn(
        transaction,
        firestore,
        uid,
        0,
        state.lastDayKey,
        'relate',
      );
      return 'dropped';
    }
    if (decision === 'forgotten') {
      releaseLeaseIn(
        transaction,
        firestore,
        uid,
        0,
        state.lastDayKey,
        'relate',
      );
      clearDue();
      return 'dropped';
    }
    if (decision === 'failed') {
      const attempts = state.attempts + 1;
      const hasGivenUp = attempts >= RELATE_BATCH.maxAttempts;
      releaseLeaseIn(
        transaction,
        firestore,
        uid,
        hasGivenUp ? 0 : attempts,
        state.lastDayKey,
        'relate',
      );
      if (!hasGivenUp) return 'failed';
      clearDue();
      logger.warn('helm.relate.gaveUp', { attempts });
      return 'gaveUp';
    }
    releaseLeaseIn(transaction, firestore, uid, 0, current.dayKey, 'relate');
    clearDue();
    if (!plan || !cleaned || !backstop || !key) return 'skipped';
    const writtenIds = new Set(plan.groupings.map((planned) => planned.id));
    backstop.edits
      .filter((edit) => !writtenIds.has(edit.id))
      .forEach((edit) => {
        const ref = firestore.doc(`${base}/groupings/${edit.id}`);
        if (edit.isGone) {
          transaction.delete(ref);
          return;
        }
        const words = world?.groupingWords.get(edit.id);
        transaction.update(ref, {
          sourceKeys: edit.patch.sourceKeys,
          sources: edit.patch.sources,
          linkedKeys: edit.patch.linkedKeys,
          sealed: sealForHelm(key, {
            proposedTitle: words?.proposedTitle ?? null,
            emoji: words?.emoji ?? null,
            titles: Object.fromEntries(
              Object.entries(words?.titles ?? {}).filter(([sourceKey]) =>
                edit.patch.sourceKeys?.includes(sourceKey),
              ),
            ),
          }),
          updatedAt: now,
        });
      });
    plan.groupings.forEach((planned) => {
      transaction.set(firestore.doc(`${base}/groupings/${planned.id}`), {
        ...planned.meta,
        sealed: sealForHelm(key, planned.sealed),
      });
      planned.links.forEach((link) =>
        transaction.update(
          firestore.doc(`${base}/${link.collection}/${link.id}`),
          {
            ...(link.collection === 'tasks'
              ? { projectId: link.projectId }
              : { projectIds: [link.projectId] }),
          },
        ),
      );
      if (planned.meta.state === 'filed')
        transaction.set(
          firestore.doc(`${base}/executions/relate-${planned.id}`),
          toExecution(key, cleaned, planned, now),
        );
    });
    if (plan.refused.length > 0)
      logger.info('helm.relate.refused', { count: plan.refused.length });
    return plan.groupings.length > 0 ? 'written' : 'skipped';
  });
}
