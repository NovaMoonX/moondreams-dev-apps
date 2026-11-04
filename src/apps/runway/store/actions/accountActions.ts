import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import { openJson, sealJson } from '@apps/runway/security';
import type {
  AccountDoc,
  AccountSealed,
  ChangeDoc,
  ChangeSealed,
  Cents,
  DateOnly,
  OpenAccount,
  RunwayEncryption,
} from '@apps/runway/types';

const accountRef = (uid: string, accountId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'accounts', accountId);
const changeRef = (uid: string, changeId: string) =>
  doc(db, 'apps', 'runway', 'plans', uid, 'changes', changeId);

/** The change-log entry written in the same transaction as an account action. */
const getChangeDoc = async (encryption: RunwayEncryption, summary: string) => {
  const id = generateUuid();
  return {
    id,
    kind: 'accountChange',
    createdAt: Date.now(),
    effectiveFrom: null,
    itemIds: [],
    sealed: await sealJson(
      { summary, note: null } satisfies ChangeSealed,
      encryption,
    ),
  } satisfies ChangeDoc;
};

const toSealed = (input: AccountSealed): AccountSealed => ({
  name: input.name,
  institution: input.institution,
  kind: input.kind,
  countedTowardTotal: input.countedTowardTotal,
  isPullAccount: input.isPullAccount,
  lastFour: input.lastFour,
  balanceCents: input.balanceCents,
  balanceOn: input.balanceOn,
  holds: input.holds,
});

/** Opens an account's sealed fields, filling what an older document lacks. */
const openSealed = async (
  data: AccountDoc,
  encryption: RunwayEncryption,
): Promise<AccountSealed> => {
  const payload = await openJson<Partial<AccountSealed>>(
    data.sealed,
    encryption,
  );
  return toSealed({
    name: payload.name ?? '',
    institution: payload.institution ?? '',
    kind: payload.kind ?? 'checking',
    countedTowardTotal: payload.countedTowardTotal ?? false,
    isPullAccount: payload.isPullAccount ?? false,
    lastFour: payload.lastFour ?? null,
    balanceCents: payload.balanceCents ?? null,
    balanceOn: payload.balanceOn ?? null,
    holds: payload.holds ?? [],
  });
};

/** Adds an account and its change entry in one transaction. */
export async function createAccount(
  uid: string,
  encryption: RunwayEncryption,
  input: AccountSealed,
): Promise<string> {
  const id = generateUuid();
  const now = Date.now();
  const [sealed, change] = await Promise.all([
    sealJson(toSealed(input), encryption),
    getChangeDoc(encryption, ACCOUNT_WORDS.changeAdded(input.name)),
  ]);
  await runTransaction(db, async (transaction) => {
    transaction.set(accountRef(uid, id), {
      id,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      linkId: null,
      sealed,
    } satisfies AccountDoc);
    transaction.set(changeRef(uid, change.id), change);
  });
  return id;
}

/** Changes an account's sealed fields; `summary` is the change-log sentence. */
export async function updateAccount(
  uid: string,
  encryption: RunwayEncryption,
  accountId: string,
  input: AccountSealed,
  summary: string,
): Promise<void> {
  const [sealed, change] = await Promise.all([
    sealJson(toSealed(input), encryption),
    getChangeDoc(encryption, summary),
  ]);
  await runTransaction(db, async (transaction) => {
    transaction.update(accountRef(uid, accountId), {
      sealed,
      updatedAt: Date.now(),
    });
    transaction.set(changeRef(uid, change.id), change);
  });
}

/** Hides an account from new use; the change log keeps what it was. */
export async function archiveAccount(
  uid: string,
  encryption: RunwayEncryption,
  accountId: string,
  summary: string,
): Promise<void> {
  const now = Date.now();
  const change = await getChangeDoc(encryption, summary);
  await runTransaction(db, async (transaction) => {
    transaction.update(accountRef(uid, accountId), {
      archivedAt: now,
      updatedAt: now,
    });
    transaction.set(changeRef(uid, change.id), change);
  });
}

/** Sets what an account holds and takes those ids from any other account that held them, re-reading every account in the transaction. */
export async function setAccountHolds(
  uid: string,
  encryption: RunwayEncryption,
  accountId: string,
  holds: string[],
  openAccounts: OpenAccount[],
): Promise<void> {
  const target = openAccounts.find((account) => account.id === accountId);
  const taken = new Set(holds);
  const others = openAccounts.filter((account) => account.id !== accountId);
  await runTransaction(db, async (transaction) => {
    const [targetSnapshot, ...otherSnapshots] = await Promise.all(
      [accountId, ...others.map((account) => account.id)].map((id) =>
        transaction.get(accountRef(uid, id)),
      ),
    );
    if (!targetSnapshot.exists()) throw new Error('The account is gone.');
    const targetData = targetSnapshot.data() as AccountDoc;
    const targetSealed = await openSealed(targetData, encryption);
    const now = Date.now();
    const writes = await Promise.all(
      otherSnapshots.map(async (snapshot) => {
        if (!snapshot.exists()) return null;
        const data = snapshot.data() as AccountDoc;
        const current = await openSealed(data, encryption);
        if (!current.holds.some((id) => taken.has(id))) return null;
        return {
          id: data.id,
          sealed: await sealJson(
            {
              ...current,
              holds: current.holds.filter((id) => !taken.has(id)),
            },
            encryption,
          ),
        };
      }),
    );
    const [sealed, change] = await Promise.all([
      sealJson({ ...targetSealed, holds }, encryption),
      getChangeDoc(
        encryption,
        ACCOUNT_WORDS.changeHolds(target?.name ?? targetSealed.name),
      ),
    ]);
    transaction.update(accountRef(uid, accountId), { sealed, updatedAt: now });
    writes.forEach((write) => {
      if (!write) return;
      transaction.update(accountRef(uid, write.id), {
        sealed: write.sealed,
        updatedAt: now,
      });
    });
    transaction.set(changeRef(uid, change.id), change);
  });
}

/** Records what an account holds on a day. A snapshot on the account: it moves nothing in the ledger. */
export async function setAccountBalance(
  uid: string,
  encryption: RunwayEncryption,
  accountId: string,
  balanceCents: Cents,
  balanceOn: DateOnly,
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(accountRef(uid, accountId));
    if (!snapshot.exists()) throw new Error('The account is gone.');
    const current = await openSealed(snapshot.data() as AccountDoc, encryption);
    const [sealed, change] = await Promise.all([
      sealJson({ ...current, balanceCents, balanceOn }, encryption),
      getChangeDoc(encryption, ACCOUNT_WORDS.changeBalance(current.name)),
    ]);
    transaction.update(accountRef(uid, accountId), {
      sealed,
      updatedAt: Date.now(),
    });
    transaction.set(changeRef(uid, change.id), change);
  });
}
