import { httpsCallable } from 'firebase/functions';

import type {
  EndConnectionRequest,
  GrantConnectionRequest,
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
