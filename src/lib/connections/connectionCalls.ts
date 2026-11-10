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

/** Refused with `already-exists` while a live grant for the same reader, source and account stands. */
export const grantConnection = async (request: GrantConnectionRequest) =>
  (await grantConnectionCallable(request)).data.grantId;

export const updateConnection = async (request: UpdateConnectionRequest) => {
  await updateConnectionCallable(request);
};

export const endConnection = async (request: EndConnectionRequest) => {
  await endConnectionCallable(request);
};
