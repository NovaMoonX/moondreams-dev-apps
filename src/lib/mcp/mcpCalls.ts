import { httpsCallable } from 'firebase/functions';

import { functions } from '@lib/firebase/config';

/** A kind of source an assistant can be allowed to read. */
export type McpReadScope = 'mail' | 'drive' | 'apps';

const completeMcpSignInCallable = httpsCallable<
  { externalAuthId: string },
  { redirectUri: string }
>(functions, 'completeMcpSignIn');

const updateMcpClientCallable = httpsCallable<
  | { clientKey: string; canWrite: boolean }
  | { clientKey: string; readScope: McpReadScope; isOn: boolean },
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

export const setMcpReadScope = async (
  clientKey: string,
  readScope: McpReadScope,
  isOn: boolean,
) => {
  await updateMcpClientCallable({ clientKey, readScope, isOn });
};

export const disconnectMcpClient = async (clientKey: string) => {
  await disconnectMcpClientCallable({ clientKey });
};
