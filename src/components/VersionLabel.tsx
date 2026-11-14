import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';

import { SITE_VERSION } from '@lib/app';
import { updateToLatest } from '@lib/app/appUpdate';
import { getVersionStatus, latestVersionQueryOptions } from '@lib/app/appVersionQueries';
import { useRestartApp } from '@hooks/useRestartApp';

const subscribeToConnection = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

export function VersionLabel() {
  const { data: latest } = useQuery(latestVersionQueryOptions());
  const isOnline = useSyncExternalStore(subscribeToConnection, () => navigator.onLine);
  const [isUpdating, setIsUpdating] = useState(false);
  const status = getVersionStatus(SITE_VERSION, latest ?? null);
  const update = useRestartApp(
    () => setIsUpdating(true),
    () => (latest ? updateToLatest(latest) : undefined),
  );
  const canUpdate = status === 'outdated' && isOnline;

  return (
    <>
      Version {SITE_VERSION}
      {status === 'latest' && ' (latest)'}
      {canUpdate && (
        <span className='mt-2 flex flex-col items-center gap-2'>
          <span>Version {latest} is out</span>
          <Button size='sm' variant='secondary' loading={isUpdating} onClick={update}>
            Update to the latest
          </Button>
        </span>
      )}
    </>
  );
}
