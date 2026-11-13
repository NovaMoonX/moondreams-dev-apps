import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { RULE_WORDS } from '@apps/runway/constants';
import { RULE_VARIES } from '@apps/runway/engine/rules';
import { sealJson } from '@apps/runway/security';
import type {
  ChangeDoc,
  ChangeSealed,
  OpenRule,
  RuleDoc,
  RuleSealed,
  RunwayEncryption,
} from '@apps/runway/types';

const ruleRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'rules', id);

const hasCondition = (rule: RuleSealed) =>
  rule.merchantKey !== null || rule.category !== null || rule.cardId !== null;

const assertAllowed = (rule: RuleSealed) => {
  const isMerchant = rule.merchantKey !== null;
  if (
    !hasCondition(rule) ||
    (isMerchant && (rule.category !== null || rule.cardId !== null)) ||
    (rule.target === RULE_VARIES && !isMerchant)
  ) {
    throw new Error(RULE_WORDS.pickOne);
  }
};

const sealBatchChange = async (
  encryption: RunwayEncryption,
  summary: string,
  targets: readonly string[],
  now: number,
) => {
  const id = generateUuid();
  return {
    id,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: null,
    itemIds: Array.from(new Set(targets)).filter(
      (target) => target !== RULE_VARIES,
    ),
    sealed: await sealJson(
      { summary, note: null } satisfies ChangeSealed,
      encryption,
    ),
  } satisfies ChangeDoc;
};

const sealChange = (
  encryption: RunwayEncryption,
  summary: string,
  target: string,
  now: number,
) => sealBatchChange(encryption, summary, [target], now);

const toPayload = (rule: RuleSealed): RuleSealed => ({
  merchantKey: rule.merchantKey,
  merchantName: rule.merchantName,
  category: rule.category,
  cardId: rule.cardId,
  target: rule.target,
});

/** Makes a rule and writes a moneyless change-log entry with it; resolves with the new rule. */
export async function createRule(
  uid: string,
  encryption: RunwayEncryption,
  input: RuleSealed,
  summary: string,
): Promise<OpenRule> {
  assertAllowed(input);
  const id = generateUuid();
  const now = Date.now();
  const [sealed, change] = await Promise.all([
    sealJson(toPayload(input), encryption),
    sealChange(encryption, summary, input.target, now),
  ]);
  await runTransaction(db, async (transaction) => {
    transaction.set(ruleRef(uid, id), {
      id,
      createdAt: now,
      updatedAt: now,
      sealed,
    } satisfies RuleDoc);
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', change.id),
      change,
    );
  });
  return { ...toPayload(input), id, createdAt: now, updatedAt: now };
}

/** Changes a rule's conditions or envelope. Refused when another device changed or removed it first; what it already placed stays where it is. */
export async function updateRule(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenRule,
  input: RuleSealed,
  summary: string,
): Promise<void> {
  assertAllowed(input);
  const now = Math.max(Date.now(), previous.updatedAt + 1);
  const [sealed, change] = await Promise.all([
    sealJson(toPayload(input), encryption),
    sealChange(encryption, summary, input.target, now),
  ]);
  await runTransaction(db, async (transaction) => {
    const stored = await transaction.get(ruleRef(uid, previous.id));
    if (
      !stored.exists() ||
      ((stored.data() as RuleDoc).updatedAt ?? stored.data().createdAt) !==
        previous.updatedAt
    ) {
      throw new Error(RULE_WORDS.gone);
    }
    transaction.update(ruleRef(uid, previous.id), { updatedAt: now, sealed });
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', change.id),
      change,
    );
  });
}

/** Removes a rule; purchases it placed keep their envelopes. */
export async function deleteRule(
  uid: string,
  encryption: RunwayEncryption,
  previous: OpenRule,
  summary: string,
): Promise<void> {
  const change = await sealChange(
    encryption,
    summary,
    previous.target,
    Date.now(),
  );
  await runTransaction(db, async (transaction) => {
    const stored = await transaction.get(ruleRef(uid, previous.id));
    if (!stored.exists()) throw new Error(RULE_WORDS.gone);
    transaction.delete(ruleRef(uid, previous.id));
    transaction.set(
      doc(db, 'apps', 'runway', 'plans', uid, 'changes', change.id),
      change,
    );
  });
}

// A chunk is one transaction: its rules plus one change entry stay well under Firestore's 500 writes.
const BATCH_SIZE = 400;

const changeRef = (uid: string, id: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'changes', id);

const stampOf = (data: unknown) =>
  (data as RuleDoc).updatedAt ?? (data as RuleDoc).createdAt;

/** What a bulk write did: `done` is what it wrote, `skipped` what was changed or removed elsewhere (or already back) and left alone, `failed` what sat in a chunk that did not save. */
export interface RulesBatch<Input, Done> {
  done: Done[];
  skipped: Input[];
  failed: Input[];
}

/** A rule as it was and as a bulk move left it, kept so the Undo can put it back while it still holds what was written. */
export interface RuleMove {
  before: OpenRule;
  after: OpenRule;
}

const runInChunks = <Input, Done>(
  items: readonly Input[],
  run: (chunk: Input[]) => Promise<{ done: Done[]; skipped: Input[] }>,
) =>
  Array.from({ length: Math.ceil(items.length / BATCH_SIZE) }, (_, index) =>
    items.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  ).reduce<Promise<RulesBatch<Input, Done>>>(
    async (previous, chunk) => {
      const sofar = await previous;
      return run(chunk).then(
        (result) => ({
          done: [...sofar.done, ...result.done],
          skipped: [...sofar.skipped, ...result.skipped],
          failed: sofar.failed,
        }),
        () => ({ ...sofar, failed: [...sofar.failed, ...chunk] }),
      );
    },
    Promise.resolve({ done: [], skipped: [], failed: [] }),
  );

/** Points many rules at one envelope (or at "ask every time") in one transaction per chunk, each with one change entry. A rule changed or removed on another device is skipped, never overwritten. */
export function updateRules(
  uid: string,
  encryption: RunwayEncryption,
  rules: readonly OpenRule[],
  target: string,
  getSummary: (count: number) => string,
): Promise<RulesBatch<OpenRule, RuleMove>> {
  rules.forEach((rule) => assertAllowed({ ...toPayload(rule), target }));
  return runInChunks<OpenRule, RuleMove>(rules, async (chunk) => {
    const sealedList = await Promise.all(
      chunk.map((rule) => sealJson({ ...toPayload(rule), target }, encryption)),
    );
    return runTransaction(db, async (transaction) => {
      const stored = await Promise.all(
        chunk.map((rule) => transaction.get(ruleRef(uid, rule.id))),
      );
      const checked = chunk.map((rule, index) => ({
        rule,
        sealed: sealedList[index],
        isCurrent:
          stored[index].exists() &&
          stampOf(stored[index].data()) === rule.updatedAt,
      }));
      const current = checked.filter(({ isCurrent }) => isCurrent);
      const skipped = checked
        .filter(({ isCurrent }) => !isCurrent)
        .map(({ rule }) => rule);
      if (current.length === 0) return { done: [], skipped };
      const now = Date.now();
      const change = await sealBatchChange(
        encryption,
        getSummary(current.length),
        [target],
        now,
      );
      const done = current.map(({ rule, sealed }) => {
        const updatedAt = Math.max(now, rule.updatedAt + 1);
        transaction.update(ruleRef(uid, rule.id), { updatedAt, sealed });
        return { before: rule, after: { ...rule, target, updatedAt } };
      });
      transaction.set(changeRef(uid, change.id), change);
      return { done, skipped };
    });
  });
}

/** Puts rules back as they were, only while each still holds what the move wrote; one that changed since stays as it is. */
export function undoUpdateRules(
  uid: string,
  encryption: RunwayEncryption,
  moves: readonly RuleMove[],
  getSummary: (count: number) => string,
): Promise<RulesBatch<RuleMove, OpenRule>> {
  return runInChunks<RuleMove, OpenRule>(moves, async (chunk) => {
    const sealedList = await Promise.all(
      chunk.map(({ before }) => sealJson(toPayload(before), encryption)),
    );
    return runTransaction(db, async (transaction) => {
      const stored = await Promise.all(
        chunk.map(({ after }) => transaction.get(ruleRef(uid, after.id))),
      );
      const checked = chunk.map((move, index) => ({
        move,
        sealed: sealedList[index],
        isCurrent:
          stored[index].exists() &&
          stampOf(stored[index].data()) === move.after.updatedAt,
      }));
      const current = checked.filter(({ isCurrent }) => isCurrent);
      const skipped = checked
        .filter(({ isCurrent }) => !isCurrent)
        .map(({ move }) => move);
      if (current.length === 0) return { done: [], skipped };
      const now = Date.now();
      const change = await sealBatchChange(
        encryption,
        getSummary(current.length),
        [
          ...current.map(({ move }) => move.before.target),
          ...current.map(({ move }) => move.after.target),
        ],
        now,
      );
      const done = current.map(({ move, sealed }) => {
        const updatedAt = Math.max(now, move.after.updatedAt + 1);
        transaction.update(ruleRef(uid, move.after.id), { updatedAt, sealed });
        return { ...move.before, updatedAt };
      });
      transaction.set(changeRef(uid, change.id), change);
      return { done, skipped };
    });
  });
}

/** Removes many rules in one transaction per chunk, each with one change entry; a rule changed or removed elsewhere is skipped. Purchases they placed keep their envelopes. */
export function deleteRules(
  uid: string,
  encryption: RunwayEncryption,
  rules: readonly OpenRule[],
  getSummary: (count: number) => string,
): Promise<RulesBatch<OpenRule, OpenRule>> {
  return runInChunks<OpenRule, OpenRule>(rules, async (chunk) =>
    runTransaction(db, async (transaction) => {
      const stored = await Promise.all(
        chunk.map((rule) => transaction.get(ruleRef(uid, rule.id))),
      );
      const checked = chunk.map((rule, index) => ({
        rule,
        isCurrent:
          stored[index].exists() &&
          stampOf(stored[index].data()) === rule.updatedAt,
      }));
      const done = checked
        .filter(({ isCurrent }) => isCurrent)
        .map(({ rule }) => rule);
      const skipped = checked
        .filter(({ isCurrent }) => !isCurrent)
        .map(({ rule }) => rule);
      if (done.length === 0) return { done, skipped };
      const change = await sealBatchChange(
        encryption,
        getSummary(done.length),
        done.map(({ target }) => target),
        Date.now(),
      );
      done.forEach((rule) => transaction.delete(ruleRef(uid, rule.id)));
      transaction.set(changeRef(uid, change.id), change);
      return { done, skipped };
    }),
  );
}

/** Makes removed rules again with their own ids and dates; one that has been made again since is left alone. */
export function undoDeleteRules(
  uid: string,
  encryption: RunwayEncryption,
  rules: readonly OpenRule[],
  getSummary: (count: number) => string,
): Promise<RulesBatch<OpenRule, OpenRule>> {
  return runInChunks<OpenRule, OpenRule>(rules, async (chunk) => {
    const sealedList = await Promise.all(
      chunk.map((rule) => sealJson(toPayload(rule), encryption)),
    );
    return runTransaction(db, async (transaction) => {
      const stored = await Promise.all(
        chunk.map((rule) => transaction.get(ruleRef(uid, rule.id))),
      );
      const checked = chunk.map((rule, index) => ({
        rule,
        sealed: sealedList[index],
        isFree: !stored[index].exists(),
      }));
      const current = checked.filter(({ isFree }) => isFree);
      const skipped = checked
        .filter(({ isFree }) => !isFree)
        .map(({ rule }) => rule);
      if (current.length === 0) return { done: [], skipped };
      const now = Date.now();
      const change = await sealBatchChange(
        encryption,
        getSummary(current.length),
        current.map(({ rule }) => rule.target),
        now,
      );
      const done = current.map(({ rule, sealed }) => {
        const updatedAt = Math.max(now, rule.updatedAt + 1);
        transaction.set(ruleRef(uid, rule.id), {
          id: rule.id,
          createdAt: rule.createdAt,
          updatedAt,
          sealed,
        } satisfies RuleDoc);
        return { ...rule, updatedAt };
      });
      transaction.set(changeRef(uid, change.id), change);
      return { done, skipped };
    });
  });
}
