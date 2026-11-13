import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@lib/security';
import { openJson } from '@apps/runway/security';
import type {
  OpenRule,
  RuleDoc,
  RuleSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** A rule written as `{ merchantKey, target }` reads as a merchant rule: every key it lacks is null. */
const toOpenRule = (data: RuleDoc, payload: Partial<RuleSealed>): OpenRule => ({
  id: data.id,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt ?? data.createdAt,
  merchantKey: payload.merchantKey ?? null,
  merchantName: payload.merchantName ?? payload.merchantKey ?? null,
  category: payload.category ?? null,
  cardId: payload.cardId ?? null,
  target: payload.target ?? 'varies',
});

/** Every rule. A slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startRulesListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (rules: OpenRule[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption, openJson);

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, 'rules'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry): Promise<OpenRule> => {
            const data = { ...(entry.data() as RuleDoc), id: entry.id };
            return toOpenRule(
              data,
              await read<Partial<RuleSealed>>(data.sealed),
            );
          }),
        );
        if (current !== sequence.latest || run.isStopped) return;
        onChange(opened);
      } catch (error) {
        if (current === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
