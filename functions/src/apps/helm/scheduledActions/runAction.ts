import { HttpsError } from 'firebase-functions/v2/https';

import type { SortResult } from '../sortHelmCapture.js';
import { SCHEDULED_OWN_KINDS } from '../nomos/commands.js';
import {
  readActionState,
  type StoredScheduled,
} from '../nomos/planScheduledActions.js';
import {
  canRunNow,
  readCaptureKey,
  readDueRuns,
  readNextRun,
  readOccurrences,
  readRuleProblem,
  readRunBlocker,
  toCaptureId,
  toDayKeyIn,
  type Occurrence,
} from '../nomos/scheduledActions.js';

const SCAN = 100;

type Outcome = 'done' | 'needsYou' | 'failed' | 'skipped' | 'waiting';
type Reason =
  'notConnected' | 'grantExpired' | 'notAllowed' | 'runFailed' | 'ruleInvalid';

/** What one stored action needs this tick, decided from its fields alone so no model is asked first. */
export type RunDecision =
  | { kind: 'none' }
  | { kind: 'patch'; patch: Record<string, unknown> }
  | {
      kind: 'run';
      captureId: string;
      dueAt: number;
      key: string;
      isNow: boolean;
      skipped: Occurrence[];
      next: Occurrence | null;
    };

export interface RunInput {
  stored: StoredScheduled;
  homeZone: string;
  now: number;
  /** The person's `scheduledActionsChangedAt`: an open after a wait is what lets a waiting run try again. */
  changedAt: number | null;
}

const advance = (next: Occurrence | null): Record<string, unknown> => ({
  nextRunAt: next?.at ?? null,
  nextRunKey: next?.key ?? null,
  ...(next ? {} : { status: 'ended', endedBy: 'finished' }),
});

const failedPatch = (
  now: number,
  dueAt: number | null,
  captureId: string | null,
  reason: Reason,
) => ({
  lastRunAt: now,
  lastRunDueAt: dueAt,
  lastRunCaptureId: captureId,
  lastOutcome: 'failed' satisfies Outcome,
  lastFailReason: reason,
  runNowAt: null,
});

/** Decides what an action does now: nothing, a field patch (finished, skipped, blocked, invalid) or a run to make. */
export function decideRun({
  stored,
  homeZone,
  now,
  changedAt,
}: RunInput): RunDecision {
  const { doc, id } = stored;
  const state = readActionState(doc);
  if (state.status !== 'active') {
    return doc.runNowAt === null || doc.runNowAt === undefined
      ? { kind: 'none' }
      : { kind: 'patch', patch: { runNowAt: null } };
  }
  const isRunNow =
    typeof doc.runNowAt === 'number' &&
    canRunNow({
      status: state.status,
      lastOutcome: typeof doc.lastOutcome === 'string' ? doc.lastOutcome : null,
      nextRunAt: state.nextRunAt,
      now,
    });
  const lastKey = readCaptureKey(
    typeof doc.lastRunCaptureId === 'string' ? doc.lastRunCaptureId : null,
  );
  const blocker = readRunBlocker({
    allowed: Array.isArray(doc.allowed) ? (doc.allowed as string[]) : [],
    permitted: SCHEDULED_OWN_KINDS,
    needs: [],
  });
  if (isRunNow && lastKey) {
    const dueAt = typeof doc.lastRunDueAt === 'number' ? doc.lastRunDueAt : now;
    const captureId = `${toCaptureId(id, lastKey)}_now`;
    return blocker || !stored.words
      ? {
          kind: 'patch',
          patch: failedPatch(
            now,
            dueAt,
            captureId,
            blocker ? blocker.reason : 'runFailed',
          ),
        }
      : {
          kind: 'run',
          captureId,
          dueAt,
          key: lastKey,
          isNow: true,
          skipped: [],
          next: null,
        };
  }
  const clear = typeof doc.runNowAt === 'number' ? { runNowAt: null } : {};
  if (state.nextRunAt === null || state.nextRunAt > now) {
    return Object.keys(clear).length > 0
      ? { kind: 'patch', patch: clear }
      : { kind: 'none' };
  }
  const isWaiting = doc.lastOutcome === 'waiting';
  if (
    isWaiting &&
    (changedAt === null || changedAt <= Number(doc.lastRunAt ?? 0))
  )
    return { kind: 'none' };
  const fromKey =
    state.nextRunKey ?? toDayKeyIn(state.nextRunAt, state.timeZone ?? homeZone);
  const occurrences = readRuleProblem(state.repeat, state.startsOn)
    ? null
    : readOccurrences(state, homeZone, { fromKey, limit: SCAN });
  if (!occurrences) {
    return {
      kind: 'patch',
      patch: {
        ...failedPatch(now, state.nextRunAt, null, 'ruleInvalid'),
        nextRunAt: null,
        nextRunKey: null,
      },
    };
  }
  const due = readDueRuns(occurrences, now, {
    waitingKey: isWaiting ? state.nextRunKey : null,
  });
  const handled = due.run ?? due.skipped[due.skipped.length - 1] ?? null;
  if (!handled) {
    const next = readNextRun(state, homeZone, { now, afterKey: null });
    return { kind: 'patch', patch: { ...clear, ...advance(next) } };
  }
  const next = readNextRun(state, homeZone, { now, afterKey: handled.key });
  const skippedPatch = {
    lastRunAt: now,
    lastRunDueAt: handled.at,
    lastRunCaptureId: null,
    lastOutcome: 'skipped' satisfies Outcome,
    lastFailReason: null,
    runNowAt: null,
    ...advance(next),
  };
  if (!due.run) return { kind: 'patch', patch: skippedPatch };
  const captureId = toCaptureId(id, due.run.key);
  if (blocker || !stored.words) {
    return {
      kind: 'patch',
      patch: {
        ...failedPatch(
          now,
          due.run.at,
          captureId,
          blocker ? blocker.reason : 'runFailed',
        ),
        ...advance(next),
      },
    };
  }
  return {
    kind: 'run',
    captureId,
    dueAt: due.run.at,
    key: due.run.key,
    isNow: false,
    skipped: due.skipped,
    next,
  };
}

const outcomeOf = (result: SortResult): Outcome | null =>
  result.status === 'sorted'
    ? 'done'
    : result.status === 'needsYou'
      ? 'needsYou'
      : result.status === 'failed'
        ? 'failed'
        : null;

/** The fields a finished attempt writes. A run waiting on the person's limits stays due; Run it now never moves the next run. */
export function settleRun(
  decision: Extract<RunDecision, { kind: 'run' }>,
  result: SortResult | { held: string } | { error: true },
  now: number,
): Record<string, unknown> | null {
  const base = {
    lastRunAt: now,
    lastRunDueAt: decision.dueAt,
    lastRunCaptureId: decision.captureId,
    runNowAt: null,
  };
  if ('held' in result) {
    return decision.isNow
      ? { ...base, lastOutcome: 'waiting', lastFailReason: null }
      : {
          ...base,
          lastOutcome: 'waiting',
          lastFailReason: null,
          nextRunAt: decision.dueAt,
          nextRunKey: decision.key,
        };
  }
  const outcome: Outcome | null =
    'error' in result ? 'failed' : outcomeOf(result);
  if (outcome === null) return null;
  return {
    ...base,
    lastOutcome: outcome,
    lastFailReason: outcome === 'failed' ? 'runFailed' : null,
    ...(decision.isNow ? {} : advance(decision.next)),
  };
}

export const isHeldError = (error: unknown) =>
  error instanceof HttpsError && error.code === 'resource-exhausted';
