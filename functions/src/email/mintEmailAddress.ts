import { randomBytes } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';

import { EMAIL_DOMAIN, readAddressToken } from './emailUtils.js';

interface MintInput {
  firestore: Firestore;
  uid: string;
  tokenPath: (token: string) => string;
  intakePath: string;
  prefix: string;
}

/** Gives a person a new private address and ends the one they had, in one write; creates the first one too. Returns the full address. */
export async function mintEmailAddress({
  firestore,
  uid,
  tokenPath,
  intakePath,
  prefix,
}: MintInput): Promise<string> {
  const token = randomBytes(16).toString('hex');
  const address = `${prefix}+${token}@${EMAIL_DOMAIN}`;
  const intakeRef = firestore.doc(intakePath);
  const now = Date.now();
  await firestore.runTransaction(async (transaction) => {
    const old = (await transaction.get(intakeRef)).data();
    const oldToken =
      typeof old?.address === 'string'
        ? readAddressToken(old.address, prefix, EMAIL_DOMAIN)
        : null;
    if (oldToken !== null) {
      transaction.delete(firestore.doc(tokenPath(oldToken)));
    }
    transaction.set(firestore.doc(tokenPath(token)), { uid, createdAt: now });
    transaction.set(intakeRef, {
      address,
      confirmUrl: null,
      confirmCode: null,
      confirmAt: null,
      lastReceivedAt: null,
      createdAt: typeof old?.createdAt === 'number' ? old.createdAt : now,
      updatedAt: now,
    });
  });
  return address;
}
