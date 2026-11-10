import { useAppCatalog } from '@/hooks/useAppCatalog';
import { readConnectorAppId } from '@/lib/connections/contract';
import { getConnectorManifest } from '@/lib/connections/sources';
import { HELM_COPY } from '@apps/helm/constants';

/** Reads a connector's source name and one of its categories' labels from the app catalog and the source's declaration. */
export function useSourceAppName() {
  const { apps } = useAppCatalog();
  const nameOf = (connectorId: string) => {
    if (connectorId === 'google:calendar') return HELM_COPY.googleCalendarName;
    const appId = readConnectorAppId(connectorId) ?? '';
    return apps.find((app) => app.id === appId)?.name ?? appId;
  };
  const categoryLabelOf = (connectorId: string, category: string) =>
    getConnectorManifest(connectorId)?.categories.find(
      (entry) => entry.id === category,
    )?.label ?? category;
  return { nameOf, categoryLabelOf };
}
