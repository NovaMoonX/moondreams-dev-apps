import {
  useMutation,
  useQuery,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { readConnectorOptions } from '@/lib/connections/connectionCalls';
import { functions } from '@lib/firebase/config';

export const CONTACTS_CONNECTOR_ID = 'google:contacts';
export const CONTACTS_SCOPE =
  'https://www.googleapis.com/auth/contacts.readonly';
export const CONTACTS_PER_CALL = 50;
export const CONTACTS_SHOWN_MAX = 2000;

export interface ContactsImportResult {
  executionId: string | null;
  brought: number;
  filled: number;
  alreadyIn: number;
  summary: string | null;
}

type ImportRequest =
  { accountId: string; resourceNames: string[] } | { whoId: string };

const importHelmContactsCallable = httpsCallable<
  ImportRequest,
  ContactsImportResult
>(functions, 'importHelmContacts');

/** The reason a failed call carries (`reconnect`, `notConnected`, `goneAtGoogle`), or null. */
export const readContactsFailure = (error: unknown) => {
  const details =
    typeof error === 'object' && error !== null && 'details' in error
      ? (error as { details?: unknown }).details
      : null;
  const reason =
    typeof details === 'object' && details !== null && 'reason' in details
      ? (details as { reason?: unknown }).reason
      : null;
  return reason === 'reconnect' ||
    reason === 'notConnected' ||
    reason === 'goneAtGoogle'
    ? reason
    : null;
};

/** The account's contacts as the platform lists them, held in memory only: never cached past the picker. */
export function useContactOptions(accountId: string | null) {
  return useQuery({
    queryKey: ['helm', 'contactOptions', accountId],
    queryFn: () =>
      readConnectorOptions({
        connectorId: CONTACTS_CONNECTOR_ID,
        accountId: accountId ?? '',
      }),
    enabled: accountId !== null,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Brings the ticked contacts in; the server re-reads each one from Google and ignores anything else the request says. */
export function useImportContacts(
  handlers: Pick<
    UseMutationOptions<ContactsImportResult, unknown, ImportRequest>,
    'onSuccess' | 'onError'
  > = {},
) {
  return useMutation({
    mutationFn: async (request: ImportRequest) =>
      (await importHelmContactsCallable(request)).data,
    ...handlers,
  });
}
