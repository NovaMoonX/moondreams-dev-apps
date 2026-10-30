import { normalizeAppStatus, type AppMetadata, type AppStatus } from '@lib/types/appCatalog';

export interface AppDraft {
  name: string;
  description: string;
  status: AppStatus;
  isRestricted: boolean;
  isRequestable: boolean;
  allowedUsers: string[];
}

export function toDraft(app: AppMetadata): AppDraft {
  return {
    name: app.name,
    description: app.description ?? '',
    status: normalizeAppStatus(app.status ?? 'draft'),
    isRestricted: app.isRestricted ?? false,
    isRequestable: app.isRequestable,
    allowedUsers: app.allowedUsers ?? [],
  };
}

export function isSameDraft(a: AppDraft, b: AppDraft) {
  const sortedA = [...a.allowedUsers].sort((x, y) => x.localeCompare(y));
  const sortedB = [...b.allowedUsers].sort((x, y) => x.localeCompare(y));

  return (
    a.name.trim() === b.name.trim() &&
    a.description.trim() === b.description.trim() &&
    a.status === b.status &&
    a.isRestricted === b.isRestricted &&
    a.isRequestable === b.isRequestable &&
    sortedA.length === sortedB.length &&
    sortedA.every((value, index) => value === sortedB[index])
  );
}
