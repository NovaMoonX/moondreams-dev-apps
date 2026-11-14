import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useEffect, useState } from 'react';
import { Link, useLocation, useRouteError } from 'react-router-dom';

import CopyTextButton from '@components/CopyTextButton';
import { VersionLabel } from '@components/VersionLabel';
import { useRestartApp } from '@hooks/useRestartApp';
import { useUpdateReady } from '@hooks/useUpdateReady';
import Loading from '@ui/Loading';
import { SITE_VERSION } from '@lib/app';
import { useCanSeeDebugDetails } from '@lib/debugProfiles/useCanSeeDebugDetails';
import { getRegistryAppForPath } from '../lib/app/app.registry';
import {
  canReloadForStaleChunk,
  isStaleChunkError,
  reloadForStaleChunk,
  restartWithFreshFiles,
} from '../lib/app/appUpdate';

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }

  return { message: String(error), stack: null };
}

function ErrorScreen({ error }: { error: unknown }) {
  const isChunkError = isStaleChunkError(error);
  // A plain reload goes through the same worker and fails the same way, so this one also drops its cached files.
  const restart = useRestartApp(
    undefined,
    isChunkError ? restartWithFreshFiles : undefined,
  );
  const isUpdateReady = useUpdateReady();
  const canRestart = isUpdateReady || isChunkError;
  const { pathname } = useLocation();
  const { message, stack } = getErrorDetails(error);
  const showDetails = useCanSeeDebugDetails();
  // A screen's file missing after a deploy: the new version is loaded straight into the screen asked for.
  const [isReloading] = useState(
    () => isChunkError && canReloadForStaleChunk(),
  );

  useEffect(() => {
    if (isReloading) reloadForStaleChunk();
  }, [isReloading]);

  if (isReloading) return <Loading />;

  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='border-border bg-card w-full max-w-lg rounded-2xl border p-8 text-center shadow-sm'>
        <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
          {pathname === '/'
            ? 'Home'
            : (getRegistryAppForPath(pathname)?.name ?? 'Unknown')}
        </p>
        <h1 className='text-foreground mt-4 text-3xl font-semibold tracking-tight'>
          Uh oh, something went wrong.
        </h1>
        <p className='text-foreground/70 mt-3 text-base'>
          We hit a snag loading this page. Try heading back home, or refresh to
          try again.
        </p>
        {showDetails && (
          <div className='border-destructive/30 bg-destructive/5 mt-6 rounded-lg border p-4 text-left'>
            <p className='text-destructive text-sm font-medium wrap-break-word'>
              {message}
            </p>
            {stack && (
              <pre className='text-foreground/60 mt-2 max-h-48 overflow-auto text-xs whitespace-pre-wrap'>
                {stack}
              </pre>
            )}
            <CopyTextButton
              className='mt-3'
              variant='secondary'
              label='Copy error'
              text={[
                message,
                stack,
                `Page: ${pathname}`,
                `Version: ${SITE_VERSION}`,
              ]
                .filter(Boolean)
                .join('\n\n')}
            />
          </div>
        )}
        {canRestart && (
          <p className='text-foreground/70 mt-3 text-base'>
            {isChunkError
              ? 'Part of this page didn’t load. Restart to fetch it fresh.'
              : 'A new version is ready. Restart to load it.'}
          </p>
        )}
        <div className='mt-6 flex flex-wrap justify-center gap-3'>
          {canRestart && <Button onClick={restart}>Restart</Button>}
          <Link to='/'>
            <Button variant={canRestart ? 'secondary' : 'primary'}>
              Back home
            </Button>
          </Link>
        </div>
        <p className='text-foreground/50 mt-6 text-xs'>
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
