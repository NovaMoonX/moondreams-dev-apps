import type { Firestore } from 'firebase-admin/firestore';

/** Thrown when the provider no longer honours the account's sign-in; the account and its grants then read as needing Reconnect. */
export class ReconnectNeeded extends Error {
  constructor() {
    super('The account needs to be reconnected.');
    this.name = 'ReconnectNeeded';
  }
}

/** A fresh access token for the account, opened and refreshed only inside this module. */
export const getGoogleAccessToken = async (
  _firestore: Firestore,
  _uid: string,
  _accountId: string,
): Promise<string> => {
  throw new Error('Not built yet.');
};
