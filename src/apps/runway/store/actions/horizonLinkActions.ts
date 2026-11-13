import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';
import { PART_OF_WORDS } from '@apps/runway/constants';
import { getNextVersionId } from '@apps/runway/engine/horizon';
import { addLink, removeLink } from '@apps/runway/engine/horizonLinks';
import { sealJson } from '@apps/runway/security';
import type {
  ChangeDoc,
  ChangeSealed,
  DateOnly,
  HorizonLink,
  HorizonSealed,
  PlanVersionDoc,
  RunwayEncryption,
} from '@apps/runway/types';

/** An open event as the device reads it just before the write, and the line its log gets. */
export interface LinkEventEdit {
  eventId: string;
  horizon: HorizonSealed;
  baseVersionId: string;
  summary: string;
}

export interface SetChangeLinkInput {
  link: HorizonLink;
  /** The event that holds the link now, which lets it go; null when none does. */
  from: LinkEventEdit | null;
  /** The event that takes it; null leaves the change part of no event. */
  to: LinkEventEdit | null;
  today: DateOnly;
}

const planPath = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

async function sealEdit(
  encryption: RunwayEncryption,
  edit: LinkEventEdit,
  horizon: HorizonSealed,
  on: DateOnly,
  now: number,
) {
  const [eventSealed, logSealed] = await Promise.all([
    sealJson(horizon, encryption),
    sealJson(
      { summary: edit.summary, note: null } satisfies ChangeSealed,
      encryption,
    ),
  ]);
  const logId = generateUuid();
  return {
    version: {
      id: getNextVersionId(edit.baseVersionId),
      itemId: edit.eventId,
      kind: 'horizon',
      createdAt: now,
      effectiveFrom: on,
      effectiveUntil: null,
      changeId: logId,
      sealed: eventSealed,
    } satisfies PlanVersionDoc,
    log: {
      id: logId,
      kind: 'planChange',
      createdAt: now,
      effectiveFrom: null,
      itemIds: [edit.eventId],
      sealed: logSealed,
    } satisfies ChangeDoc,
  };
}

/** Moves one change's link between events (or ties or unties it) in one transaction, refused when either event's next version already exists, so an event edited on another device is never overwritten. The change itself is not touched. */
export async function setChangeLink(
  uid: string,
  encryption: RunwayEncryption,
  input: SetChangeLinkInput,
): Promise<void> {
  if (input.from && input.to && input.from.eventId === input.to.eventId)
    throw new Error(PART_OF_WORDS.eventChanged);
  const now = Date.now();
  const writes = await Promise.all([
    ...(input.from
      ? [
          sealEdit(
            encryption,
            input.from,
            removeLink(input.from.horizon, input.link.changeId),
            input.today,
            now,
          ),
        ]
      : []),
    ...(input.to
      ? [
          sealEdit(
            encryption,
            input.to,
            addLink(input.to.horizon, input.link),
            input.today,
            now,
          ),
        ]
      : []),
  ]);
  await runTransaction(db, async (transaction) => {
    const taken = await Promise.all(
      writes.map(({ version }) =>
        transaction.get(planPath(uid, 'versions', version.id)),
      ),
    );
    if (taken.some((snapshot) => snapshot.exists()))
      throw new Error(PART_OF_WORDS.eventChanged);
    writes.forEach(({ version, log }) => {
      transaction.set(planPath(uid, 'versions', version.id), version);
      transaction.set(planPath(uid, 'changes', log.id), log);
    });
  });
}
