import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type {
  BatchProvider,
  BatchRequest,
  BatchResult,
} from '../../../ai/batch.js';
import { EMPTY_USAGE, getUsageCost } from '../../../ai/models.js';
import type { Keyring } from '../../../appKeys/keyring.js';
import type { SealedPayload } from '../../../appKeys/seal.js';
import { recordAiSpend, releaseAiCall } from '../aiLimits.js';
import {
  openForHelm,
  sealForHelm,
  unwrapHelmKey,
  type HelmKey,
} from '../helmKey.js';
import { readDaySummary, type HelmDayCounts } from './countDay.js';
import {
  BATCH_ANSWER_LINE,
  BATCH_MAX_TOKENS,
  SUBMIT_DAY_SUMMARY_TOOL,
  type PreparedDaySummary,
} from './writeDaySummary.js';

const BATCHES = 'apps/helm/daySummaryBatches';

export interface QueuedSummary {
  uid: string;
  dayKey: string;
  reservedAt: number;
  request: PreparedDaySummary;
}

interface BatchEntry {
  uid: string;
  dayKey: string;
  reservedAt: number;
}

export interface SummaryDocState {
  status: string;
  batchId: string | null;
  staleAt: number | null;
}

export type BatchSettlement =
  { kind: 'dropped' } | { kind: 'written'; text: string } | { kind: 'retry' };

/** What one batch result does to its summary: only the batch the document still waits on, while nobody marked it stale, may change it; an answer that fails the checks leaves it `counted` for the next run. */
export const settleBatchResult = (input: {
  result: BatchResult;
  batchId: string;
  doc: SummaryDocState | null;
  counts: HelmDayCounts | null;
}): BatchSettlement => {
  const { result, batchId, doc, counts } = input;
  if (
    !doc ||
    doc.batchId !== batchId ||
    doc.staleAt !== null ||
    doc.status !== 'counted'
  ) {
    return { kind: 'dropped' };
  }
  if (result.outcome !== 'succeeded' || !counts) return { kind: 'retry' };
  const text = readDaySummary(
    (result.output as { summary?: unknown } | null)?.summary,
    counts,
  );
  return text ? { kind: 'written', text } : { kind: 'retry' };
};

/** Submits the requests as one batch; when the submit throws, every reservation is given back and the answer is null, so the days stay `counted` for a later run. */
export async function submitSummaryBatch(
  provider: BatchProvider,
  queued: QueuedSummary[],
  release: (entry: QueuedSummary) => Promise<unknown>,
): Promise<{ batchId: string; ids: Record<string, QueuedSummary> } | null> {
  if (queued.length === 0) return null;
  const ids = Object.fromEntries(
    queued.map((entry, index) => [`r${index}`, entry]),
  );
  const requests: BatchRequest[] = Object.entries(ids).map(
    ([customId, { request }]) => ({
      customId,
      role: 'daySummary',
      system: `${request.system}\n\n${BATCH_ANSWER_LINE}`,
      message: request.message,
      schema: SUBMIT_DAY_SUMMARY_TOOL.inputSchema,
      maxTokens: BATCH_MAX_TOKENS,
    }),
  );
  try {
    return { batchId: await provider.submit(requests), ids };
  } catch {
    logger.warn('helm.daySummary.batchSubmitFailed');
    await Promise.all(
      queued.map((entry) => release(entry).catch(() => undefined)),
    );
    return null;
  }
}

/** Sends the claimed days to one batch, remembers it, and marks each day as waiting on it. */
export async function submitDaySummaryBatch(
  firestore: Firestore,
  provider: BatchProvider,
  queued: QueuedSummary[],
  now: number,
) {
  const submitted = await submitSummaryBatch(provider, queued, (entry) =>
    Promise.all([
      releaseAiCall(firestore, entry.uid, entry.reservedAt, 'quick'),
      firestore
        .doc(`apps/helm/users/${entry.uid}/daySummaries/${entry.dayKey}`)
        .update({ attempts: FieldValue.increment(-1) }),
    ]),
  );
  if (!submitted) return 0;
  const { batchId, ids } = submitted;
  await firestore.doc(`${BATCHES}/${batchId}`).set({
    createdAt: now,
    requests: Object.fromEntries(
      Object.entries(ids).map(([customId, { uid, dayKey, reservedAt }]) => [
        customId,
        { uid, dayKey, reservedAt },
      ]),
    ),
  });
  await Promise.all(
    Object.values(ids).map(({ uid, dayKey }) => {
      const ref = firestore.doc(
        `apps/helm/users/${uid}/daySummaries/${dayKey}`,
      );
      return firestore.runTransaction(async (transaction) => {
        const latest = await transaction.get(ref);
        if (latest.get('status') !== 'counted' || latest.get('batchId')) return;
        transaction.update(ref, { batchId, batchedAt: now });
      });
    }),
  );
  return queued.length;
}

const openPayload = (key: HelmKey, sealed: unknown) => {
  try {
    const payload = openForHelm(key, sealed as SealedPayload);
    return typeof payload.line === 'string' &&
      typeof payload.counts === 'object' &&
      payload.counts !== null
      ? { line: payload.line, counts: payload.counts as HelmDayCounts }
      : null;
  } catch {
    return null;
  }
};

/** A batch ends within 24 hours, so one still open after this is never coming back. */
const BATCH_GIVE_UP_MS = 26 * 60 * 60 * 1000;

const EXPIRED = (customId: string): BatchResult => ({
  customId,
  outcome: 'expired',
  output: null,
  usage: EMPTY_USAGE,
});

/** Writes the results of every ended batch until `deadline`; one still running is left. A result is matched by its custom id, a request that came back with no result counts as expired, and a batch past 26 hours is settled as expired and forgotten. Each entry leaves the batch document in the transaction that settles it, so a rerun never pays or releases twice. */
export async function collectDaySummaryBatches(
  firestore: Firestore,
  provider: BatchProvider,
  keyring: Keyring,
  now: number,
  deadline: number,
) {
  const open = await firestore.collection(BATCHES).get();
  const keys = new Map<string, Promise<HelmKey>>();
  const keyFor = (uid: string) => {
    const known = keys.get(uid) ?? unwrapHelmKey(firestore, keyring, uid);
    keys.set(uid, known);
    return known;
  };

  const settleOne = async (
    batchId: string,
    customId: string,
    entry: BatchEntry,
    result: BatchResult,
  ) => {
    const ref = firestore.doc(
      `apps/helm/users/${entry.uid}/daySummaries/${entry.dayKey}`,
    );
    const batchRef = firestore.doc(`${BATCHES}/${batchId}`);
    const key = await keyFor(entry.uid);
    const isUnanswered = result.outcome !== 'succeeded';
    const settlement = await firestore.runTransaction(async (transaction) => {
      const [latest, batch] = await Promise.all([
        transaction.get(ref),
        transaction.get(batchRef),
      ]);
      if (!batch.get(`requests.${customId}`)) return null;
      const payload = latest.exists
        ? openPayload(key, latest.get('sealed'))
        : null;
      const staleAt = latest.get('staleAt');
      const batchOf = latest.get('batchId');
      const next = settleBatchResult({
        result,
        batchId,
        doc: latest.exists
          ? {
              status: String(latest.get('status')),
              batchId: typeof batchOf === 'string' ? batchOf : null,
              staleAt: typeof staleAt === 'number' ? staleAt : null,
            }
          : null,
        counts: payload?.counts ?? null,
      });
      if (next.kind === 'written' && payload) {
        transaction.update(ref, {
          status: 'written',
          writtenAt: now,
          sealed: sealForHelm(key, {
            text: next.text,
            line: payload.line,
            counts: payload.counts,
          }),
          batchId: null,
          batchedAt: null,
        });
      }
      if (next.kind === 'retry') {
        transaction.update(ref, {
          batchId: null,
          batchedAt: null,
          ...(isUnanswered ? { attempts: FieldValue.increment(-1) } : {}),
        });
      }
      transaction.update(batchRef, {
        [`requests.${customId}`]: FieldValue.delete(),
      });
      return next;
    });
    if (!settlement) return;
    if (isUnanswered) {
      await releaseAiCall(firestore, entry.uid, entry.reservedAt, 'quick');
    }
    const cost = getUsageCost('daySummary', result.usage, { isBatch: true });
    if (cost > 0) {
      await recordAiSpend(firestore, now, cost).catch(() =>
        logger.error('helm.ai.spendNotRecorded'),
      );
    }
  };

  const collectOne = async (batchId: string, data: Record<string, unknown>) => {
    const isAbandoned = now - Number(data.createdAt ?? 0) > BATCH_GIVE_UP_MS;
    const results = await provider.collect(batchId).catch((error: unknown) => {
      if (isAbandoned) return [];
      throw error;
    });
    if (!results && !isAbandoned) return;
    const entries = (data.requests ?? {}) as Record<string, BatchEntry>;
    const byId = new Map(
      (results ?? []).map((result) => [result.customId, result]),
    );
    const left = await Object.entries(entries).reduce(
      async (previous, [customId, entry]) => {
        const count = await previous;
        if (Date.now() > deadline) return count + 1;
        try {
          await settleOne(
            batchId,
            customId,
            entry,
            byId.get(customId) ?? EXPIRED(customId),
          );
          return count;
        } catch {
          logger.warn('helm.daySummary.batchResultFailed', {
            batchId,
            customId,
          });
          return count + 1;
        }
      },
      Promise.resolve(0),
    );
    if (left === 0 || isAbandoned) {
      await firestore.doc(`${BATCHES}/${batchId}`).delete();
    }
  };

  await Promise.all(
    open.docs.map((doc) =>
      collectOne(doc.id, doc.data()).catch(() =>
        logger.warn('helm.daySummary.batchCollectFailed', { batchId: doc.id }),
      ),
    ),
  );
}
