import { collection, doc, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { runHeldTransaction } from '@apps/helm/store/actions/heldTransaction';

import { store } from '@/store';
import {
  cutCorrection,
  isRefusedLine,
  normaliseClaim,
} from '@apps/helm/engine/seenAs';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { sealJson } from '@apps/helm/security';
import type { OpenSeenAs } from '@apps/helm/store/listeners/seenAsListener';
import type { SeenAsSealed } from '@apps/helm/types';

export interface SeenAsChange {
  /** Puts back exactly what the line held before the change; false when the line changed since, and is left alone. */
  undo: () => Promise<boolean>;
}

const lineRef = (uid: string, id: string) =>
  doc(collection(db, 'apps', 'helm', 'users', uid, 'seenAs'), id);

const findLine = (id: string) =>
  store.getState().helm.seenAs.items.find((one) => one.id === id) ?? null;

interface Written {
  state: OpenSeenAs['state'];
  at: number;
}

/** Puts the fields and the words of a line back as `before` held them, only while the line still holds what this change wrote. Its basis follows the sources the line has now. */
const restore = async (uid: string, before: OpenSeenAs, written: Written) => {
  const encryption = await getHelmEncryption(uid);
  const ref = lineRef(uid, before.id);
  return runHeldTransaction(uid, async (transaction) => {
    const live = await transaction.get(ref);
    if (!live.exists()) return false;
    const data = live.data();
    const stamp =
      written.state === 'corrected' ? data.correctedAt : data.removedAt;
    if (data.state !== written.state || stamp !== written.at) return false;
    const liveKeys: unknown = data.sourceKeys;
    const isSameBasis =
      Array.isArray(liveKeys) &&
      liveKeys.length === before.sourceKeys.length &&
      liveKeys.every((key, index) => key === before.sourceKeys[index]);
    const sealed = await sealJson<SeenAsSealed>(
      {
        line: before.line,
        basis: isSameBasis
          ? before.basis
          : (findLine(before.id)?.basis ?? before.basis),
        corrected: before.corrected,
      },
      encryption,
    );
    transaction.update(ref, {
      state: before.state,
      correctedAt: before.correctedAt,
      removedAt: before.removedAt,
      dontDrawFrom: before.dontDrawFrom,
      writtenBy: before.writtenBy,
      privacy: before.privacy,
      sealed,
    });
    return true;
  });
};

/** "That's not quite right": the person's words become the line, outranking the guess; its sealed line and basis stay. */
export async function correctSeenAs(
  uid: string,
  id: string,
  words: string,
): Promise<SeenAsChange | null> {
  const before = findLine(id);
  const corrected = cutCorrection(words);
  if (!before || corrected === '') return null;
  const sealed = await sealJson<SeenAsSealed>(
    { line: before.line, basis: before.basis, corrected },
    await getHelmEncryption(uid),
  );
  const at = Date.now();
  await updateDoc(lineRef(uid, id), {
    state: 'corrected',
    correctedAt: at,
    writtenBy: 'person',
    privacy: isRefusedLine(corrected, false) ? 'private' : before.privacy,
    sealed,
  });
  return { undo: () => restore(uid, before, { state: 'corrected', at }) };
}

/** "Remove this": the line is forgotten and its sources are marked, so no new line of the kind is drawn from them; the words behind it stay where they were said. */
export async function removeSeenAs(
  uid: string,
  id: string,
): Promise<SeenAsChange | null> {
  const before = findLine(id);
  if (!before) return null;
  const sealed = await sealJson<SeenAsSealed>(
    { line: normaliseClaim(before.line), basis: before.basis, corrected: null },
    await getHelmEncryption(uid),
  );
  const at = Date.now();
  await updateDoc(lineRef(uid, id), {
    state: 'removed',
    removedAt: at,
    dontDrawFrom: before.sourceKeys,
    sealed,
  });
  return { undo: () => restore(uid, before, { state: 'removed', at }) };
}
