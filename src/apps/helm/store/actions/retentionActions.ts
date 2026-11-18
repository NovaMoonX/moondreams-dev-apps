import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { shiftDayKeyBy } from '@/utils/cadenceUtils';
import {
  EXECUTION_KEEP_DAYS,
  OBSERVATION_KEEP_WEEKS,
  PRUNE_RUN_CAP,
} from '@apps/helm/constants';
import { CUT_EVIDENCE, isPatternCut } from '@apps/helm/engine/patternCheck';
import { applyRetire } from '@apps/helm/engine/patterns';
import { readPrunable } from '@apps/helm/engine/retention';
import { sealJson } from '@apps/helm/security';
import type { HelmEncryption, Pattern, PatternSealed } from '@apps/helm/types';

const DAY_MS = 86_400_000;
const PRUNE_EVERY_DAYS = 7;
const PATTERNS_READ = 6_000;

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

/** Whether the weekly clean-up is due: never run, or a week since it was. */
export const isPruneDue = (prunedOn: string | null, todayKey: string) =>
  prunedOn === null || shiftDayKeyBy(prunedOn, PRUNE_EVERY_DAYS) <= todayKey;

/** The weekly clean-up: reads only what is old enough to go, plus the patterns, and removes at most a run's cap of steps. A run that finds nothing still records the day. */
export async function pruneWeekly(
  uid: string,
  encryption: HelmEncryption,
  now: number,
  todayKey: string,
) {
  const read = (name: string, field: string, before: number) =>
    getDocs(
      query(
        collection(userOf(uid), name),
        where(field, '<', before),
        limit(PRUNE_RUN_CAP),
      ),
    );
  const [observations, reflections, executions, patterns] = await Promise.all([
    read('observations', 'at', now - OBSERVATION_KEEP_WEEKS * 7 * DAY_MS),
    read('reflections', 'seenAt', now),
    read('executions', 'createdAt', now - EXECUTION_KEEP_DAYS * DAY_MS),
    getDocs(query(collection(userOf(uid), 'patterns'), limit(PATTERNS_READ))),
  ]);
  const stored = new Map(
    patterns.docs.map((entry) => [entry.id, entry.data() as Pattern]),
  );
  const result = readPrunable({
    observations: observations.docs.map((entry) => ({
      id: entry.id,
      at: (entry.data() as { at?: number }).at ?? 0,
    })),
    patterns: patterns.docs.map((entry) => {
      const data = entry.data() as Pattern;
      return {
        id: entry.id,
        isLive: data.isLive,
        offReason: data.offReason,
        isCut: isPatternCut(data),
        offAt: data.offAt,
        lastEvidenceAt: data.lastEvidenceAt,
        sourceKeys: data.sourceKeys,
        evidence: data.evidence,
      };
    }),
    reflections: reflections.docs.map((entry) => ({
      dayKey: entry.id,
      seenAt: (entry.data() as { seenAt?: number | null }).seenAt ?? null,
    })),
    executions: executions.docs.map((entry) => ({
      id: entry.id,
      createdAt: (entry.data() as { createdAt?: number }).createdAt ?? 0,
    })),
    seenAs: [],
    now,
  });
  const batch = writeBatch(db);
  result.deletes.forEach(({ collection: name, id }) =>
    batch.delete(doc(collection(userOf(uid), name), id)),
  );
  const sealed =
    result.cuts.length > 0
      ? await sealJson<PatternSealed>(
          { statement: '', evidenceLine: '', reasonLine: null },
          encryption,
        )
      : null;
  result.cuts.forEach((id) =>
    batch.update(doc(collection(userOf(uid), 'patterns'), id), {
      evidence: CUT_EVIDENCE,
      sourceKeys: [],
      reasons: [],
      history: [],
      sealed,
    }),
  );
  result.retires.forEach((id) => {
    const pattern = stored.get(id);
    if (pattern)
      batch.update(doc(collection(userOf(uid), 'patterns'), id), {
        ...applyRetire(pattern, { now }),
        lastEditedAt: now,
      });
  });
  await batch.commit();
  await updateDoc(userOf(uid), { prunedOn: todayKey });
}
