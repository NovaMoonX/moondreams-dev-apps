import { APP_REGISTRY } from './app.registry';

const REGISTRY_ORDER = APP_REGISTRY.map((app) => app.id as string);

function getRegistryIndex(id: string) {
  const index = REGISTRY_ORDER.indexOf(id);
  return index === -1 ? REGISTRY_ORDER.length : index;
}

/** Starred apps first in the order they were starred, then the rest in registry order, so a list never reshuffles between visits. */
export function orderApps<T extends { id: string }>(apps: T[], starredIds: string[]) {
  const starred = starredIds
    .map((id) => apps.find((app) => app.id === id))
    .filter((app): app is T => app !== undefined);
  const rest = apps
    .filter((app) => !starredIds.includes(app.id))
    .sort((left, right) => getRegistryIndex(left.id) - getRegistryIndex(right.id));
  return [...starred, ...rest];
}
