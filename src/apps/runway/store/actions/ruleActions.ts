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

const sealChange = async (
  encryption: RunwayEncryption,
  summary: string,
  target: string,
  now: number,
) => {
  const id = generateUuid();
  return {
    id,
    kind: 'planChange',
    createdAt: now,
    effectiveFrom: null,
    itemIds: target === RULE_VARIES ? [] : [target],
    sealed: await sealJson(
      { summary, note: null } satisfies ChangeSealed,
      encryption,
    ),
  } satisfies ChangeDoc;
};

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
