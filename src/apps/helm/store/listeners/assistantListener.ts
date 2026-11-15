import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import type {
  ConnectedAssistant,
  OpenConnectedAssistant,
} from '@apps/helm/types';

/** The assistants this person connected and has not disconnected, most recently used first. Nothing in them is sealed. */
export function startAssistantsListener(
  uid: string,
  onChange: (assistants: OpenConnectedAssistant[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'mcpClients', uid, 'clients'),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map((entry): OpenConnectedAssistant => {
            const data = entry.data() as Partial<ConnectedAssistant>;
            return {
              clientKey: entry.id,
              appId: 'helm',
              clientId: data.clientId ?? '',
              name: data.name ?? 'An assistant',
              workosUserId: data.workosUserId ?? '',
              firstSeenAt: data.firstSeenAt ?? 0,
              lastUsedAt: data.lastUsedAt ?? data.firstSeenAt ?? 0,
              canWrite: data.canWrite === true,
              readScopes: (['mail', 'drive', 'apps'] as const).filter(
                (scope) =>
                  Array.isArray(data.readScopes) &&
                  data.readScopes.includes(scope),
              ),
              revokedAt: data.revokedAt ?? null,
            };
          })
          .filter((entry) => entry.revokedAt === null)
          .sort((a, b) => b.lastUsedAt - a.lastUsedAt),
      ),
    onError,
  );
}
