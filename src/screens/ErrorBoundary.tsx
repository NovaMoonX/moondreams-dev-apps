import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Link, useLocation, useRouteError } from 'react-router-dom';

import { VersionLabel } from '@components/VersionLabel';
import { useAuth } from '@hooks/useAuth';
import { IS_INSTALLED_APP } from '@utils/pwaUtils';
import { getRegistryAppForPath } from '../lib/app/app.registry';

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }

  return { message: String(error), stack: null };
}

function ErrorBoundary() {
  const error = useRouteError();
  const { isAdmin } = useAuth();
  const { pathname } = useLocation()
  const { message, stack } = getErrorDetails(error);
  const showDetails = import.meta.env.DEV || isAdmin;

  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm'>
        <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
            {pathname === '/' ? 'Home' : getRegistryAppForPath(pathname)?.name ?? 'Unknown'}
        </p>
        <h1 className='text-foreground mt-4 text-3xl font-semibold tracking-tight'>
          Uh oh, something went wrong.
        </h1>
        <p className='text-foreground/70 mt-3 text-base'>
          We hit a snag loading this page.{' '}
          {IS_INSTALLED_APP
            ? 'Try heading back home, or reload to try again.'
            : 'Try heading back home, or refresh to try again.'}
        </p>
        {showDetails && (
          <div className='border-destructive/30 bg-destructive/5 mt-6 rounded-lg border p-4 text-left'>
            <p className='text-destructive text-sm font-medium wrap-break-word'>{message}</p>
            {stack && (
              <pre className='text-foreground/60 mt-2 max-h-48 overflow-auto text-xs whitespace-pre-wrap'>
                {stack}
              </pre>
            )}
          </div>
        )}
        <div className='mt-6 flex flex-wrap justify-center gap-3'>
          <Link to='/'>
            <Button>Back home</Button>
          </Link>
          {IS_INSTALLED_APP && (
            <Button variant='secondary' onClick={() => window.location.reload()}>
              Reload
            </Button>
          )}
        </div>
        <p className='text-foreground/50 mt-6 text-xs'><VersionLabel /></p>
      </div>
    </div>
  );
}

export default ErrorBoundary;
