import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

const completeMcpSignInCallable = httpsCallable<
  { externalAuthId: string },
  { redirectUri: string }
>(functions, 'completeMcpSignIn');

const updateMcpClientCallable = httpsCallable<
  { clientKey: string; canWrite: boolean },
  unknown
>(functions, 'updateMcpClient');

const disconnectMcpClientCallable = httpsCallable<
  { clientKey: string },
  unknown
>(functions, 'disconnectMcpClient');

/** Finishes an outside assistant's sign-in for the signed-in person and returns where to send them back. */
export const completeMcpSignIn = async (externalAuthId: string) =>
  (await completeMcpSignInCallable({ externalAuthId })).data.redirectUri;

export const updateMcpClient = async (clientKey: string, canWrite: boolean) => {
  await updateMcpClientCallable({ clientKey, canWrite });
};

export const disconnectMcpClient = async (clientKey: string) => {
  await disconnectMcpClientCallable({ clientKey });
};
