import { doc, runTransaction } from 'firebase/firestore';
import type { DocumentSnapshot } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils/idUtils';
import { formatCents } from '@/utils/moneyUtils';

import {
  CONVERT_WORDS,
  HOME_TILE_COUNT,
  MAX_PURCHASE_CENTS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getNextVersionId } from '@apps/runway/engine/horizon';
import { openJson, sealJson } from '@apps/runway/security';
import { markLedgerWrite } from '@apps/runway/store/actions/closingActions';
import { buildNewItemDocs } from '@apps/runway/store/actions/itemActions';
import {
  openPlanFields,
  sealPlanFields,
} from '@apps/runway/store/actions/planActions';
import {
  assertPlanStarted,
  assertSourceLive,
  getUndoTransferMoveId,
} from '@apps/runway/store/actions/transferActions';
import type {
  AccountDoc,
  AccountSealed,
  ChangeSealed,
  Cents,
  DateOnly,
  EnvelopeSealed,
  GoalSealed,
  MoveDoc,
  PlanDoc,
  PlanItemDoc,
  RunwayEncryption,
  TransferSealed,
} from '@apps/runway/types';
import { readHomePins } from '@apps/runway/utils/homePins';

const planRef = (uid: string) => doc(db, 'apps', 'runway', 'plans', uid);
const subRef = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, collectionName, id);

type ConvertKind = 'envelope' | 'goal';

interface ConvertBase {
  /** Made once by the caller, with the new item's id, so a retry or a second device resolves to the same conversion. */
  moveId: string;
  newItemId: string;
  itemId: string;
  name: string;
  /** What the item holds as this device reads it; zero moves nothing, less than zero is refused. */
  heldCents: Cents;
  /** Every open account, so the ones that hold the item are found as they are now. */
  accountIds: string[];
}

export type ConvertItemInput = ConvertBase &
  (
    | { from: 'envelope'; payload: GoalSealed }
    | { from: 'goal'; payload: EnvelopeSealed }
  );

export interface ConvertWritten {
  moveId: string;
  itemId: string;
  newItemId: string;
  /** The kind the item was; the new one is the other. */
  from: ConvertKind;
  name: string;
  /** What moved across; zero when it held nothing. */
  cents: Cents;
  /** The day the old item was closed and the new one began, which the Undo checks is still on the old header. */
  date: DateOnly;
  changeId: string;
  versionId: string;
  /** The accounts that held the old item and now hold the new one. */
  heldBy: string[];
  /** The envelope was pinned to Home, and the pin was dropped. */
  wasPinned: boolean;
}

const readHeldBy = async (
  snapshots: DocumentSnapshot[],
  heldId: string,
  encryption: RunwayEncryption,
) => {
  const ids = await Promise.all(
    snapshots.map(async (snapshot) => {
      if (!snapshot.exists()) return null;
      const data = snapshot.data() as AccountDoc;
      if (data.archivedAt !== null) return null;
      const sealed = await openJson<AccountSealed>(data.sealed, encryption);
      return sealed.holds.includes(heldId) ? data.id : null;
    }),
  );
  return ids.filter((id): id is string => id !== null);
};

const getOther = (kind: ConvertKind): ConvertKind =>
  kind === 'envelope' ? 'goal' : 'envelope';

/**
 * Turns an envelope into a goal, or a goal into an envelope, in one transaction. The old item is closed
 * (its write-once `archivedAt`, with `heldReleasedOn` left null) and a new item of the other kind begins
 * the same day with everything the old one held moved across by one `transfer`, so the money and the
 * history stay and an item's `kind` is never rewritten. One change entry names both items. The accounts
 * that held the old item hold the new one, and an envelope's Home pin is dropped. A second run with the
 * same ids finds the first one's documents and writes nothing.
 */
export async function convertItem(
  uid: string,
  encryption: RunwayEncryption,
  input: ConvertItemInput,
): Promise<ConvertWritten> {
  const { itemId, newItemId, moveId, name } = input;
  if (input.heldCents < 0) throw new Error(CONVERT_WORDS.failed);
  const cents = input.heldCents;
  if (cents > MAX_PURCHASE_CENTS) throw new Error(CONVERT_WORDS.failed);
  const to = getOther(input.from);
  const date = todayAsUtcDate();
  const now = Date.now();
  const changeId = generateUuid();
  const money = cents > 0 ? formatCents(cents) : null;
  const summary =
    to === 'goal'
      ? CONVERT_WORDS.toGoalSummary(name, money)
      : CONVERT_WORDS.toEnvelopeSummary(name, money);
  const [payloadSealed, changeSealed, moveSealed] = await Promise.all([
    sealJson(input.payload, encryption),
    sealJson({ summary } satisfies ChangeSealed, encryption),
    cents > 0
      ? sealJson(
          {
            fromId: itemId,
            toId: newItemId,
            cents,
            note: null,
            isOutside: false,
          } satisfies TransferSealed,
          encryption,
        )
      : Promise.resolve(null),
  ]);
  const docs = buildNewItemDocs({
    kind: to,
    id: newItemId,
    now,
    startDate: date,
    changeId,
    itemIds: [itemId, newItemId],
    versionSealed: payloadSealed,
    changeSealed,
    changeEffectiveFrom: null,
  });
  const written = {
    moveId,
    itemId,
    newItemId,
    from: input.from,
    name,
    cents,
    date,
    changeId,
    versionId: docs.version.id,
  } satisfies Omit<ConvertWritten, 'heldBy' | 'wasPinned'>;

  return runTransaction(db, async (transaction) => {
    const [plan, header, existingNew, existingMove, ...accountSnapshots] =
      await Promise.all([
        transaction.get(planRef(uid)),
        transaction.get(subRef(uid, 'items', itemId)),
        transaction.get(subRef(uid, 'items', newItemId)),
        transaction.get(subRef(uid, 'moves', moveId)),
        ...input.accountIds.map((id) =>
          transaction.get(subRef(uid, 'accounts', id)),
        ),
      ]);
    const planData = plan.data() as Partial<PlanDoc> | undefined;
    if (existingNew.exists() || existingMove.exists()) {
      const earlier = planData
        ? await openPlanFields(planData as PlanDoc, encryption)
        : null;
      return {
        ...written,
        heldBy: await readHeldBy(accountSnapshots, newItemId, encryption),
        wasPinned: earlier?.homePins?.includes(newItemId) ?? false,
      };
    }
    const item = header.data() as Partial<PlanItemDoc> | undefined;
    if (cents > 0) assertPlanStarted(planData, date);
    assertSourceLive(item);
    if (item?.kind !== input.from) throw new Error(CONVERT_WORDS.alreadyDone);

    const holders = await Promise.all(
      accountSnapshots.map(async (snapshot) => {
        if (!snapshot.exists()) return null;
        const data = snapshot.data() as AccountDoc;
        if (data.archivedAt !== null) return null;
        const sealed = await openJson<AccountSealed>(data.sealed, encryption);
        return sealed.holds.includes(itemId)
          ? {
              id: data.id,
              sealed: await sealJson(
                {
                  ...sealed,
                  holds: sealed.holds.map((id) =>
                    id === itemId ? newItemId : id,
                  ),
                },
                encryption,
              ),
            }
          : null;
      }),
    );
    const planFields =
      input.from === 'envelope' && planData
        ? await openPlanFields(planData as PlanDoc, encryption)
        : null;
    const pins = planFields?.homePins ?? [];
    const wasPinned = planFields !== null && pins.includes(itemId);
    const pinsSealed =
      planFields !== null && wasPinned
        ? await sealPlanFields(planFields, encryption, {
            homePins: pins.filter((id) => id !== itemId),
          })
        : null;

    transaction.set(subRef(uid, 'items', newItemId), docs.header);
    transaction.set(subRef(uid, 'versions', docs.version.id), docs.version);
    transaction.set(subRef(uid, 'changes', changeId), docs.change);
    transaction.update(subRef(uid, 'items', itemId), {
      archivedAt: date,
      becameItemId: newItemId,
    });
    if (moveSealed !== null) {
      markLedgerWrite(transaction, uid, planData, [date]);
      transaction.set(subRef(uid, 'moves', moveId), {
        id: moveId,
        kind: 'transfer',
        date,
        refId: itemId,
        reversesMoveId: null,
        createdAt: now,
        sealed: moveSealed,
      } satisfies MoveDoc);
    }
    holders.forEach((holder) => {
      if (holder === null) return;
      transaction.update(subRef(uid, 'accounts', holder.id), {
        sealed: holder.sealed,
        updatedAt: now,
      });
    });
    if (pinsSealed !== null) {
      transaction.update(planRef(uid), { sealed: pinsSealed, updatedAt: now });
    }
    return {
      ...written,
      heldBy: holders.flatMap((holder) => (holder === null ? [] : [holder.id])),
      wasPinned,
    };
  });
}

export interface UndoConvertInput extends ConvertWritten {
  /** What the new item holds as this device reads it; the money comes back only while it is all still there. */
  newHeldCents: Cents;
  /** Whether the new item has history of its own since (`hasLaterHistory`). */
  hasLaterHistory: boolean;
  accountIds: string[];
  /** The envelopes the lists show now, so a restored pin is kept only while Home has room. */
  liveEnvelopeIds: string[];
}

/**
 * Takes a conversion back in one transaction: the reversing transfer, the old item open again, the new
 * item closed, the accounts that held it holding the old one again, the old Home pin back when there is
 * room, and one change entry naming both. Items cannot be deleted, so the new one is archived. The old
 * header's `archivedAt` is the second write-once field this clears (the other is
 * `undoEnvelopeIntoHorizon`), and only while it still holds the day this conversion wrote. Refuses with
 * a sentence when the new item holds less or more than moved, was archived otherwise or has history of its own.
 * Resolves false only when the reversing transfer already exists.
 */
export async function undoConvertItem(
  uid: string,
  encryption: RunwayEncryption,
  input: UndoConvertInput,
): Promise<boolean> {
  const { itemId, newItemId, name, cents, date } = input;
  if (input.hasLaterHistory) throw new Error(CONVERT_WORDS.undoLater(name));
  if (input.newHeldCents < cents) {
    throw new Error(CONVERT_WORDS.undoShort(name));
  }
  if (input.newHeldCents > cents) throw new Error(CONVERT_WORDS.undoChanged);
  const reverseId = getUndoTransferMoveId(input.moveId);
  const now = Date.now();
  const nextVersionId = getNextVersionId(input.versionId);
  const [reverseSealed, changeSealed] = await Promise.all([
    cents > 0
      ? sealJson(
          {
            fromId: newItemId,
            toId: itemId,
            cents,
            note: null,
            isOutside: false,
          } satisfies TransferSealed,
          encryption,
        )
      : Promise.resolve(null),
    sealJson(
      {
        summary: CONVERT_WORDS.undoSummary(name, input.from),
      } satisfies ChangeSealed,
      encryption,
    ),
  ]);
  const changeId = generateUuid();

  return runTransaction(db, async (transaction) => {
    const [plan, oldHeader, newHeader, reversed, laterVersion, ...accounts] =
      await Promise.all([
        transaction.get(planRef(uid)),
        transaction.get(subRef(uid, 'items', itemId)),
        transaction.get(subRef(uid, 'items', newItemId)),
        transaction.get(subRef(uid, 'moves', reverseId)),
        transaction.get(subRef(uid, 'versions', nextVersionId)),
        ...input.accountIds.map((id) =>
          transaction.get(subRef(uid, 'accounts', id)),
        ),
      ]);
    if (reversed.exists()) return false;
    const newItem = newHeader.data() as Partial<PlanItemDoc> | undefined;
    if (!newItem) throw new Error(CONVERT_WORDS.undoChanged);
    if ((newItem.archivedAt ?? null) !== null) {
      throw new Error(CONVERT_WORDS.undoChanged);
    }
    const oldItem = oldHeader.data() as Partial<PlanItemDoc> | undefined;
    if (!oldItem || (oldItem.archivedAt ?? null) !== date) {
      throw new Error(CONVERT_WORDS.undoChanged);
    }
    if (laterVersion.exists()) {
      throw new Error(CONVERT_WORDS.undoLater(name));
    }
    const planData = plan.data() as Partial<PlanDoc> | undefined;

    const holders = await Promise.all(
      accounts.map(async (snapshot) => {
        if (!snapshot.exists()) return null;
        const data = snapshot.data() as AccountDoc;
        if (data.archivedAt !== null) return null;
        const sealed = await openJson<AccountSealed>(data.sealed, encryption);
        if (!sealed.holds.includes(newItemId)) return null;
        if (!input.heldBy.includes(data.id)) return null;
        return {
          id: data.id,
          sealed: await sealJson(
            {
              ...sealed,
              holds: sealed.holds.map((id) => (id === newItemId ? itemId : id)),
            },
            encryption,
          ),
        };
      }),
    );
    const current = planData
      ? await openPlanFields(planData as PlanDoc, encryption)
      : {};
    const saved = current.homePins ?? null;
    const withoutNew = (saved ?? []).filter((id) => id !== newItemId);
    const isRoom =
      readHomePins(withoutNew, input.liveEnvelopeIds).length < HOME_TILE_COUNT;
    const pins =
      input.wasPinned && isRoom && !withoutNew.includes(itemId)
        ? [...withoutNew, itemId]
        : withoutNew;
    const isPinsChanged =
      pins.length !== (saved ?? []).length ||
      pins.some((id, index) => id !== (saved ?? [])[index]);
    const pinsSealed = isPinsChanged
      ? await sealPlanFields(current, encryption, { homePins: pins })
      : null;

    if (reverseSealed !== null) {
      markLedgerWrite(transaction, uid, planData, [date]);
      transaction.set(subRef(uid, 'moves', reverseId), {
        id: reverseId,
        kind: 'transfer',
        date,
        refId: newItemId,
        reversesMoveId: input.moveId,
        createdAt: now,
        sealed: reverseSealed,
      } satisfies MoveDoc);
    }
    transaction.set(subRef(uid, 'changes', changeId), {
      id: changeId,
      kind: 'planChange',
      createdAt: now,
      effectiveFrom: null,
      itemIds: [itemId, newItemId],
      sealed: changeSealed,
    });
    transaction.update(subRef(uid, 'items', itemId), {
      archivedAt: null,
      becameItemId: null,
    });
    transaction.update(subRef(uid, 'items', newItemId), { archivedAt: date });
    holders.forEach((holder) => {
      if (holder === null) return;
      transaction.update(subRef(uid, 'accounts', holder.id), {
        sealed: holder.sealed,
        updatedAt: now,
      });
    });
    if (pinsSealed !== null) {
      transaction.update(planRef(uid), { sealed: pinsSealed, updatedAt: now });
    }
    return true;
  });
}
