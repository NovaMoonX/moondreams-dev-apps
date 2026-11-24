import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { updateToLatest } from '@lib/app/appUpdate';
import { latestVersionQueryOptions } from '@lib/app/appVersionQueries';
import { useRestartApp } from '@hooks/useRestartApp';

/** Loads the newest published build: asks about unsaved work, reads the published version fresh, then reloads into it. */
export function useUpdateToLatest() {
  const queryClient = useQueryClient();
  const [isUpdating, setIsUpdating] = useState(false);
  const update = useRestartApp(
    () => setIsUpdating(true),
    async () => {
      const latest = await queryClient
        .fetchQuery({ ...latestVersionQueryOptions(), staleTime: 0 })
        .catch(() => null);
      const isReloading = await updateToLatest(latest).catch(() => false);
      if (!isReloading) setIsUpdating(false);
    },
  );
  return { update, isUpdating };
}
