import type {
  DocumentData,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../../appKeys/seal.js';
import { openForHelm, type HelmKey } from '../helmKey.js';
import type { ContextScheduledAction } from '../nomos/buildContext.js';
import {
  readActionState,
  type StoredScheduled,
} from '../nomos/planScheduledActions.js';
import {
  MAX_SCHEDULED_ACTIONS,
  describeScheduledRule,
} from '../nomos/scheduledActions.js';

const READ_CAP = MAX_SCHEDULED_ACTIONS + 1;

/** Ended actions are never deleted, so an unfiltered read would let them crowd live ones out of the cap. */
export const actionsQuery = (firestore: Firestore, base: string) =>
  firestore
    .collection(`${base}/scheduledActions`)
    .where('status', 'in', ['active', 'paused'])
    .limit(READ_CAP);

/** A stored action with its words opened; words that won't open leave `words` null, and the action is never run. */
export const openStoredAction = (
  key: HelmKey,
  id: string,
  doc: DocumentData,
): StoredScheduled => {
  try {
    const opened = openForHelm(key, doc.sealed as SealedPayload);
    return {
      id,
      doc,
      words: {
        title: typeof opened.title === 'string' ? opened.title : 'Scheduled',
        instruction:
          typeof opened.instruction === 'string' ? opened.instruction : null,
        heldCommands: Array.isArray(opened.heldCommands)
          ? (opened.heldCommands as Record<string, unknown>[])
          : null,
      },
    };
  } catch {
    return { id, doc, words: null };
  }
};

/** Every scheduled action, read inside the turn's transaction so a change lands on what is there now. */
export const readScheduledState = async (
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
): Promise<Map<string, StoredScheduled>> => {
  const snap = await transaction.get(actionsQuery(firestore, base));
  return new Map(
    snap.docs.map((entry): [string, StoredScheduled] => [
      entry.id,
      openStoredAction(key, entry.id, entry.data()),
    ]),
  );
};

/** The person's scheduled actions that have not ended, for the model to name by alias. */
export const readContextScheduled = async (
  firestore: Firestore,
  base: string,
  key: HelmKey,
  now: number,
  homeZone: string,
): Promise<ContextScheduledAction[]> => {
  const snap = await actionsQuery(firestore, base).get();
  return snap.docs.flatMap((entry): ContextScheduledAction[] => {
    const stored = openStoredAction(key, entry.id, entry.data());
    if (!stored.words) return [];
    const state = readActionState(stored.doc);
    const { words, next } = describeScheduledRule(state, homeZone, now);
    return [
      {
        id: entry.id,
        title: stored.words.title,
        repeat: words,
        status: state.status,
        next: next[0]?.key ?? null,
      },
    ];
  });
};
