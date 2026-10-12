import type { AppUsage } from '@lib/appUsage/appUsage';
import type { UserProfile } from '@lib/types/appCatalog';

/** An app's usage records joined to member profiles; records with no profile (the admin, deleted accounts) are left out. */
export function getUsageRows(usage: AppUsage[] | undefined, users: UserProfile[], activeSince: number) {
  const rows = (usage ?? []).flatMap((entry) => {
    const profile = users.find((candidate) => candidate.uid === entry.uid);
    return profile ? [{ ...entry, profile, isActive: entry.lastActiveAt >= activeSince }] : [];
  });
  return rows;
}
