import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useRouteError } from 'react-router-dom';

import DebugDetails from '@components/DebugDetails';
import { VersionLabel } from '@components/VersionLabel';
import { useRestartApp } from '@hooks/useRestartApp';
import { useUpdateReady } from '@hooks/useUpdateReady';
import Loading from '@ui/Loading';
import { useCanSeeDebugDetails } from '@lib/debugProfiles/useCanSeeDebugDetails';
import { getRegistryAppForPath } from '../lib/app/app.registry';
import {
  canReloadForStaleChunk,
  checkModuleFiles,
  isStaleChunkError,
  reloadForStaleChunk,
  repairModuleFiles,
  restartWithFreshFiles,
} from '../lib/app/appUpdate';

const FILE_URL = /https?:\/\/\S+?\.js\b/;

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }

  return { message: String(error), stack: null };
}

/** For debug viewers: every file under the one that failed, fetched as the page would, and the ones that came back wrong. */
function useFileCheck(url: string | null, isEnabled: boolean) {
  const query = useQuery({
    queryKey: ['fileCheck', url],
    queryFn: async () => {
      const { checkedCount, problems } = await checkModuleFiles(url ?? '');
      const worker = navigator.serviceWorker?.controller ? 'on' : 'off';
      const found =
        problems.length === 0
          ? 'all JavaScript'
          : problems
              .map(({ url: file, note }) => `${file.split('/').pop()} ${note}`)
              .join('; ');
      return `File check (worker ${worker}): ${checkedCount} files, ${found}`;
    },
    enabled: isEnabled && Boolean(url),
    retry: false,
    staleTime: Infinity,
  });
  return query.data ?? null;
}

function getLead(isChunkError: boolean, isUpdateReady: boolean) {
  if (isChunkError)
    return 'Part of this page didn’t load. Restart to fetch it fresh.';
  if (isUpdateReady) return 'A new version is ready. Restart to load it.';
  return 'We hit a snag loading this page. Head back home, or refresh to try again.';
}

function ErrorScreen({ error }: { error: unknown }) {
  const isChunkError = isStaleChunkError(error);
  const { message, stack } = getErrorDetails(error);
  const fileUrl = isChunkError ? (message.match(FILE_URL)?.[0] ?? null) : null;
  // A plain reload goes through the same worker and caches and fails the same way, so this one fetches the files fresh.
  const restart = useRestartApp(
    undefined,
    isChunkError ? () => restartWithFreshFiles(fileUrl) : undefined,
  );
  const isUpdateReady = useUpdateReady();
  const canRestart = isUpdateReady || isChunkError;
  const { pathname } = useLocation();
  const showDetails = useCanSeeDebugDetails();
  const fileCheck = useFileCheck(fileUrl, showDetails);
  // A screen's file missing after a deploy: the new version is loaded straight into the screen asked for.
  const [isReloading] = useState(
    () => isChunkError && canReloadForStaleChunk(),
  );

  useEffect(() => {
    if (!isReloading) return;
    void (fileUrl ? repairModuleFiles(fileUrl) : Promise.resolve()).finally(
      reloadForStaleChunk,
    );
  }, [isReloading, fileUrl]);

  if (isReloading) return <Loading />;

  const appName =
    pathname === '/' ? 'Home' : (getRegistryAppForPath(pathname)?.name ?? null);

  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-sm sm:p-8'>
        <div className='bg-destructive/10 text-destructive mx-auto flex size-12 items-center justify-center rounded-full'>
          <TriangleAlert className='size-6' aria-hidden='true' />
        </div>
        <div className='mt-4 text-center'>
          {appName && (
            <p className='text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase'>
              {appName}
            </p>
          )}
          <h1 className='text-foreground mt-1 text-2xl font-semibold tracking-tight'>
            Something went wrong
          </h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            {getLead(isChunkError, isUpdateReady)}
          </p>
        </div>

        <div className='mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-center'>
          {canRestart && (
            <Button className='w-full sm:w-auto' onClick={restart}>
              Restart
            </Button>
          )}
          <Link to='/' className='w-full sm:w-auto'>
            <Button
              className='w-full'
              variant={canRestart ? 'secondary' : 'primary'}
            >
              Back home
            </Button>
          </Link>
        </div>

        <DebugDetails
          message={message}
          facts={fileCheck ? [fileCheck] : []}
          trace={stack ? { label: 'Stack trace', text: stack } : null}
          isOpen
          className='mt-6'
        />

        <p className='text-muted-foreground/70 mt-6 text-center text-xs'>
          <VersionLabel />
        </p>
      </div>
    </div>
  );
}

// Keyed by the address, so each failed navigation decides afresh whether to reload.
function ErrorBoundary() {
  const error = useRouteError();
  const { key } = useLocation();
  return <ErrorScreen key={key} error={error} />;
}

export default ErrorBoundary;
