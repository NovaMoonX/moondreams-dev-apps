import { httpsCallable } from 'firebase/functions';

import type {
  ConnectorOption,
  EndConnectionRequest,
  FinishGoogleConnectionRequest,
  FinishGoogleConnectionResult,
  GrantConnectionRequest,
  ReadConnectorOptionsRequest,
  StartGoogleConnectionRequest,
  StartGoogleConnectionResult,
  UpdateConnectionRequest,
} from '@/lib/connections/contract';
import { functions } from '@lib/firebase/config';

const grantConnectionCallable = httpsCallable<
  GrantConnectionRequest,
  { grantId: string }
>(functions, 'grantConnection');
const updateConnectionCallable = httpsCallable<
  UpdateConnectionRequest,
  unknown
>(functions, 'updateConnection');
const endConnectionCallable = httpsCallable<EndConnectionRequest, unknown>(
  functions,
  'endConnection',
);
const syncConnectionsCallable = httpsCallable<
  { grantId?: string },
  { synced: number }
>(functions, 'syncConnections');
const deleteKeptCopiesCallable = httpsCallable<
  { grantId: string },
  { deleted: number }
>(functions, 'deleteKeptCopies');
const startGoogleConnectionCallable = httpsCallable<
  StartGoogleConnectionRequest,
  StartGoogleConnectionResult
>(functions, 'startGoogleConnection');
const finishGoogleConnectionCallable = httpsCallable<
  FinishGoogleConnectionRequest,
  FinishGoogleConnectionResult
>(functions, 'finishGoogleConnection');
const readConnectorOptionsCallable = httpsCallable<
  ReadConnectorOptionsRequest,
  { options: ConnectorOption[] }
>(functions, 'readConnectorOptions');
const releaseUnusedAccountCallable = httpsCallable<
  { accountId: string },
  { accountId: string }
>(functions, 'releaseUnusedAccount');

/** Refused with `already-exists` while a live grant for the same reader, source and account stands. */
export const grantConnection = async (request: GrantConnectionRequest) =>
  (await grantConnectionCallable(request)).data.grantId;

export const updateConnection = async (request: UpdateConnectionRequest) => {
  await updateConnectionCallable(request);
};

export const endConnection = async (request: EndConnectionRequest) => {
  await endConnectionCallable(request);
};

/** Without a grant id, every live grant of the caller that is due; with one, that grant now. */
export const syncConnections = async (request: { grantId?: string } = {}) =>
  (await syncConnectionsCallable(request)).data.synced;

export const deleteKeptCopies = async (request: { grantId: string }) =>
  (await deleteKeptCopiesCallable(request)).data.deleted;

/** Where to send the person for Google's consent, and the state to check on their return. */
export const startGoogleConnection = async (
  request: StartGoogleConnectionRequest,
) => (await startGoogleConnectionCallable(request)).data;

/** Refused with `permission-denied` when the person didn't tick the permission asked for. */
export const finishGoogleConnection = async (
  request: FinishGoogleConnectionRequest,
) => (await finishGoogleConnectionCallable(request)).data;

/** What a connector lets the person choose among (calendars), read live from the provider. */
export const readConnectorOptions = async (
  request: ReadConnectorOptionsRequest,
) => (await readConnectorOptionsCallable(request)).data.options;

/** Forgets an account the person backed out of before connecting anything; the server leaves it alone while a live grant uses it. */
export const releaseUnusedAccount = async (request: { accountId: string }) => {
  await releaseUnusedAccountCallable(request);
};
