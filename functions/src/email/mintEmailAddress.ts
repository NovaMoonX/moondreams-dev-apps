import { randomBytes } from 'node:crypto';

import type { DocumentData, Firestore } from 'firebase-admin/firestore';

import { EMAIL_DOMAIN, readAddressToken } from './emailUtils.js';

interface MintInput {
  firestore: Firestore;
  uid: string;
  tokenPath: (token: string) => string;
  intakePath: string;
  prefix: string;
  /** The intake document's fields when an app keeps its own shape; the default holds the address and an empty confirmation. */
  intakeDocument?: (fresh: {
    token: string;
    address: string;
    now: number;
    createdAt: number;
  }) => Record<string, unknown>;
  /** The token the intake document held before, when an app doesn't store the address. */
  oldTokenOf?: (old: DocumentData | undefined) => string | null;
}

/** Gives a person a new private address and ends the one they had, in one write; creates the first one too. Returns the full address. */
export async function mintEmailAddress({
  firestore,
  uid,
  tokenPath,
  intakePath,
  prefix,
  intakeDocument,
  oldTokenOf,
}: MintInput): Promise<string> {
  const token = randomBytes(16).toString('hex');
  const address = `${prefix}-${token}@${EMAIL_DOMAIN}`;
  const intakeRef = firestore.doc(intakePath);
  const now = Date.now();
  await firestore.runTransaction(async (transaction) => {
    const old = (await transaction.get(intakeRef)).data();
    const oldToken = oldTokenOf
      ? oldTokenOf(old)
      : typeof old?.address === 'string'
        ? readAddressToken(old.address, prefix, EMAIL_DOMAIN)
        : null;
    const createdAt = typeof old?.createdAt === 'number' ? old.createdAt : now;
    if (oldToken !== null) {
      transaction.delete(firestore.doc(tokenPath(oldToken)));
    }
    transaction.set(firestore.doc(tokenPath(token)), { uid, createdAt: now });
    transaction.set(
      intakeRef,
      intakeDocument?.({ token, address, now, createdAt }) ?? {
        address,
        confirmUrl: null,
        confirmCode: null,
        confirmAt: null,
        lastReceivedAt: null,
        forwardedAt: null,
        createdAt,
        updatedAt: now,
      },
    );
  });
  return address;
}
