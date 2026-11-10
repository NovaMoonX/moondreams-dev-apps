import { useAppCatalog } from '@/hooks/useAppCatalog';
import { readConnectorAppId } from '@/lib/connections/contract';
import { getSourceManifest } from '@/lib/connections/sources';

/** Reads a connector's app name and one of its categories' labels from the app catalog and the app's declaration. */
export function useSourceAppName() {
  const { apps } = useAppCatalog();
  const nameOf = (connectorId: string) => {
    const appId = readConnectorAppId(connectorId) ?? '';
    return apps.find((app) => app.id === appId)?.name ?? appId;
  };
  const categoryLabelOf = (connectorId: string, category: string) =>
    getSourceManifest(readConnectorAppId(connectorId) ?? '')?.categories.find(
      (entry) => entry.id === category,
    )?.label ?? category;
  return { nameOf, categoryLabelOf };
}
