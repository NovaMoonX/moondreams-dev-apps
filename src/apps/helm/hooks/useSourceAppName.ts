import { useAppCatalog } from '@/hooks/useAppCatalog';
import { useAuth } from '@/hooks/useAuth';
import { readConnectorAppId } from '@/lib/connections/contract';
import { getConnectorManifest } from '@/lib/connections/sources';
import { useConnectionAccounts } from '@/lib/connections/useConnectionAccounts';
import { HELM_COPY } from '@apps/helm/constants';
import type { SyncedRecord } from '@apps/helm/types';

/** Reads a connector's source name and one of its categories' labels from the app catalog and the source's declaration. */
export function useSourceAppName() {
  const { apps } = useAppCatalog();
  const nameOf = (connectorId: string) => {
    if (connectorId === 'google:calendar') return HELM_COPY.googleCalendarName;
    const appId = readConnectorAppId(connectorId) ?? '';
    return apps.find((app) => app.id === appId)?.name ?? appId;
  };
  const { user } = useAuth();
  const { accounts } = useConnectionAccounts(user?.uid ?? null);
  /** A copy's source, a calendar named by its account ("work") so two calendars read apart. */
  const sourceNameOf = (record: SyncedRecord) => {
    if (record.connectorId !== 'google:calendar')
      return nameOf(record.connectorId);
    const account = accounts.find((entry) => entry.id === record.accountId);
    return account?.label ?? account?.email ?? nameOf(record.connectorId);
  };
  const categoryLabelOf = (connectorId: string, category: string) =>
    getConnectorManifest(connectorId)?.categories.find(
      (entry) => entry.id === category,
    )?.label ?? category;
  return { nameOf, sourceNameOf, categoryLabelOf };
}
