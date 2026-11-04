import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils/idUtils';
import { ACCOUNT_WORDS } from '@apps/runway/constants';
import { openJson, sealJson } from '@apps/runway/security';
import { describeAccountBalance } from '@apps/runway/utils/accountText';
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
const getChangeDoc = async (
  encryption: RunwayEncryption,
  summary: string,
  itemIds: string[] = [],
) => {
  const id = generateUuid();
  return {
    id,
    kind: 'accountChange',
    createdAt: Date.now(),
    effectiveFrom: null,
    itemIds,
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

/** Changes what the form edits (name, bank, kind, last 4, pull, counted); what it holds and its balance are re-read and kept. */
export async function updateAccount(
  uid: string,
  encryption: RunwayEncryption,
  accountId: string,
  input: AccountSealed,
  summary: string,
): Promise<void> {
  const change = await getChangeDoc(encryption, summary);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(accountRef(uid, accountId));
    if (!snapshot.exists()) throw new Error('The account is gone.');
    const current = await openSealed(snapshot.data() as AccountDoc, encryption);
    const sealed = await sealJson(
      toSealed({
        ...input,
        holds: current.holds,
        balanceCents: current.balanceCents,
        balanceOn: current.balanceOn,
      }),
      encryption,
    );
    transaction.update(accountRef(uid, accountId), {
      sealed,
      updatedAt: Date.now(),
    });
    transaction.set(changeRef(uid, change.id), change);
  });
}

/** Hides an account from new use and frees what it held; the change log keeps what it was. */
export async function archiveAccount(
  uid: string,
  encryption: RunwayEncryption,
  accountId: string,
  summary: string,
): Promise<void> {
  const now = Date.now();
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(accountRef(uid, accountId));
    if (!snapshot.exists()) throw new Error('The account is gone.');
    const current = await openSealed(snapshot.data() as AccountDoc, encryption);
    const [sealed, change] = await Promise.all([
      sealJson({ ...current, holds: [] }, encryption),
      getChangeDoc(encryption, summary, current.holds),
    ]);
    transaction.update(accountRef(uid, accountId), {
      sealed,
      archivedAt: now,
      updatedAt: now,
    });
    transaction.set(changeRef(uid, change.id), change);
  });
}

/** What a holds save wrote to one account, kept so exactly that save can be taken back. */
export interface WrittenHolds {
  accountId: string;
  name: string;
  before: string[];
  after: string[];
}

const isSameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** Sets what an account holds, taking those items from any other account; returns what it wrote, or nothing for no change. */
export async function setAccountHolds(
  uid: string,
  encryption: RunwayEncryption,
  accountId: string,
  nextHolds: string[] | ((current: string[]) => string[]),
  openAccounts: OpenAccount[],
  nameOf: (itemId: string) => string,
): Promise<WrittenHolds[]> {
  const others = openAccounts.filter((account) => account.id !== accountId);
  return runTransaction(db, async (transaction) => {
    const [targetSnapshot, ...otherSnapshots] = await Promise.all(
      [accountId, ...others.map((account) => account.id)].map((id) =>
        transaction.get(accountRef(uid, id)),
      ),
    );
    if (!targetSnapshot.exists()) throw new Error('The account is gone.');
    const targetData = targetSnapshot.data() as AccountDoc;
    const targetSealed = await openSealed(targetData, encryption);
    const holds =
      typeof nextHolds === 'function'
        ? nextHolds(targetSealed.holds)
        : nextHolds;
    const taken = new Set(holds);
    const now = Date.now();
    const namesOf = (ids: string[]) =>
      ids.map(nameOf).filter((name) => name !== '');
    const writes = await Promise.all(
      otherSnapshots.map(async (snapshot) => {
        if (!snapshot.exists()) return null;
        const data = snapshot.data() as AccountDoc;
        const current = await openSealed(data, encryption);
        if (!current.holds.some((id) => taken.has(id))) return null;
        return {
          id: data.id,
          name: current.name,
          before: current.holds,
          after: current.holds.filter((id) => !taken.has(id)),
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
    if (
      isSameSet(holds, targetSealed.holds) &&
      writes.every((write) => write === null)
    )
      return [];
    const [sealed, change] = await Promise.all([
      sealJson({ ...targetSealed, holds }, encryption),
      getChangeDoc(
        encryption,
        ACCOUNT_WORDS.changeHolds(
          targetSealed.name,
          namesOf(holds.filter((id) => !targetSealed.holds.includes(id))),
          namesOf(targetSealed.holds.filter((id) => !holds.includes(id))),
          writes.flatMap((write) => (write ? [write.name] : [])),
        ),
        Array.from(new Set([...targetSealed.holds, ...holds])),
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
    return [
      {
        accountId,
        name: targetSealed.name,
        before: targetSealed.holds,
        after: holds,
      },
      ...writes.flatMap((write) =>
        write
          ? [
              {
                accountId: write.id,
                name: write.name,
                before: write.before,
                after: write.after,
              },
            ]
          : [],
      ),
    ];
  });
}

/** Takes back one holds save, all or nothing; returns the accounts changed since when it cannot. */
export async function undoAccountHolds(
  uid: string,
  encryption: RunwayEncryption,
  written: WrittenHolds[],
  openAccounts: OpenAccount[],
  summary: string,
): Promise<string[]> {
  const writtenIds = new Set(written.map((entry) => entry.accountId));
  const others = openAccounts.filter((account) => !writtenIds.has(account.id));
  const givenBack = new Set(
    written.flatMap((entry) =>
      entry.before.filter((id) => !entry.after.includes(id)),
    ),
  );
  return runTransaction(db, async (transaction) => {
    const [snapshots, otherSnapshots] = await Promise.all([
      Promise.all(
        written.map((entry) =>
          transaction.get(accountRef(uid, entry.accountId)),
        ),
      ),
      Promise.all(
        others.map((account) => transaction.get(accountRef(uid, account.id))),
      ),
    ]);
    const now = Date.now();
    const takenElsewhere = await Promise.all(
      otherSnapshots.map(async (snapshot) => {
        if (!snapshot.exists()) return null;
        const data = snapshot.data() as AccountDoc;
        if (data.archivedAt !== null) return null;
        const current = await openSealed(data, encryption);
        return current.holds.some((id) => givenBack.has(id))
          ? current.name
          : null;
      }),
    );
    const results = await Promise.all(
      written.map(async (entry, index) => {
        const snapshot = snapshots[index];
        if (!snapshot.exists()) return { entry, sealed: null };
        const data = snapshot.data() as AccountDoc;
        if (data.archivedAt !== null) return { entry, sealed: null };
        const current = await openSealed(data, encryption);
        if (!isSameSet(current.holds, entry.after))
          return { entry, sealed: null };
        return {
          entry,
          sealed: await sealJson(
            { ...current, holds: entry.before },
            encryption,
          ),
        };
      }),
    );
    const restored = results.flatMap(({ entry, sealed }) =>
      sealed ? [{ entry, sealed }] : [],
    );
    const skipped = [
      ...results.flatMap(({ entry, sealed }) => (sealed ? [] : [entry.name])),
      ...takenElsewhere.flatMap((name) => (name ? [name] : [])),
    ];
    if (skipped.length > 0) return skipped;
    const change = await getChangeDoc(
      encryption,
      summary,
      Array.from(
        new Set(
          restored.flatMap(({ entry }) => [...entry.before, ...entry.after]),
        ),
      ),
    );
    restored.forEach(({ entry, sealed }) =>
      transaction.update(accountRef(uid, entry.accountId), {
        sealed,
        updatedAt: now,
      }),
    );
    transaction.set(changeRef(uid, change.id), change);
    return skipped;
  });
}

/** Records what an account holds on a day, writing nothing when both are already what is stored. A snapshot on the account: it moves nothing in the ledger. */
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
    if (
      current.balanceCents === balanceCents &&
      current.balanceOn === balanceOn
    )
      return;
    const [sealed, change] = await Promise.all([
      sealJson({ ...current, balanceCents, balanceOn }, encryption),
      getChangeDoc(
        encryption,
        describeAccountBalance(current.name, balanceCents, balanceOn),
      ),
    ]);
    transaction.update(accountRef(uid, accountId), {
      sealed,
      updatedAt: Date.now(),
    });
    transaction.set(changeRef(uid, change.id), change);
  });
}
