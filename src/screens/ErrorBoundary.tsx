import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Link, useRouteError } from 'react-router-dom';

import { useAuth } from '@hooks/useAuth';

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }

  return { message: String(error), stack: null };
}

function ErrorBoundary() {
  const error = useRouteError();
  const { isAdmin } = useAuth();
  const { message, stack } = getErrorDetails(error);
  const showDetails = import.meta.env.DEV || isAdmin;

  return (
    <div className='page flex items-center justify-center px-4 py-12'>
      <div className='w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm'>
        <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
          Error
        </p>
        <h1 className='text-foreground mt-4 text-3xl font-semibold tracking-tight'>
          Uh oh, something went wrong.
        </h1>
        <p className='text-foreground/70 mt-3 text-base'>
          We hit a snag loading this page. Try heading back home, or refresh to try
          again.
        </p>
        {showDetails && (
          <div className='border-destructive/30 bg-destructive/5 mt-6 rounded-lg border p-4 text-left'>
            <p className='text-destructive text-sm font-medium break-words'>{message}</p>
            {stack && (
              <pre className='text-foreground/60 mt-2 max-h-48 overflow-auto text-xs whitespace-pre-wrap'>
                {stack}
              </pre>
            )}
          </div>
        )}
        <div className='mt-6 flex justify-center'>
          <Link to='/'>
            <Button>Back home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
