import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import AppLogo from '@/components/AppLogo';
import { useMyAccessRequests } from '@/hooks/useMyAccessRequests';
import { formatDate } from '@/utils/formatUtils';
import {
  cancelAccessRequest,
  requestAccess,
} from '@lib/accessRequests/accessRequests';
import type { AppListing } from '@lib/types/appCatalog';
import { LIST_CARD_CLASS } from '@ui/siteSurface';

interface RequestableAppsProps {
  apps: AppListing[];
  person: { uid: string; email: string | null; displayName: string | null };
}

/** Apps this person doesn't have yet but may ask for, each with its request and a way to take it back. */
function RequestableApps({ apps, person }: RequestableAppsProps) {
  const requests = useMyAccessRequests(
    apps.map((app) => app.id),
    person.uid,
  );
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openApp = apps.find((app) => app.id === openAppId) ?? null;
  const openRequest = openApp ? requests[openApp.id] : null;

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      console.error('Failed to update access request:', caught);
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className='space-y-3'>
      <h2 className='text-foreground px-1 text-base font-semibold'>
        Ask for access
      </h2>
      <ul className={LIST_CARD_CLASS}>
        {apps.map((app) => (
          <li key={app.id}>
            <Button
              type='button'
              variant='tertiary'
              className='h-auto w-full justify-start gap-3 rounded-none px-4! py-3 text-left font-normal'
              onClick={() => {
                setError(null);
                setOpenAppId(app.id);
              }}
            >
              <AppLogo
                appId={app.id}
                className='size-10 rounded-xl opacity-60 grayscale'
              />
              <span className='min-w-0 flex-1'>
                <span className='text-foreground block truncate text-sm font-medium'>
                  {app.name}
                </span>
                <span className='text-muted-foreground block truncate text-xs'>
                  {app.description}
                </span>
              </span>
              <span className='text-muted-foreground shrink-0 text-xs'>
                {requests[app.id] ? 'Requested' : 'Ask'}
              </span>
            </Button>
          </li>
        ))}
      </ul>

      <Drawer
        isOpen={openApp !== null}
        onClose={() => setOpenAppId(null)}
        title={openApp?.name ?? ''}
        showCloseButton
      >
        {openApp ? (
          <div className='space-y-5 pb-4'>
            <div className='flex items-start gap-4'>
              <AppLogo
                appId={openApp.id}
                className='size-16 rounded-2xl shadow-sm'
              />
              <p className='text-foreground/70 min-w-0 flex-1 text-sm'>
                {openApp.description}
              </p>
            </div>
            {openRequest ? (
              <div className='space-y-3'>
                <p className='text-foreground text-sm'>
                  You asked on {formatDate(openRequest.requestedAt)}. It shows
                  up with your apps once you have access.
                </p>
                <Button
                  type='button'
                  variant='secondary'
                  rounded='full'
                  className='w-full'
                  loading={isBusy}
                  onClick={() =>
                    run(() => cancelAccessRequest(openApp.id, person.uid))
                  }
                >
                  I changed my mind
                </Button>
              </div>
            ) : (
              <div className='space-y-2'>
                <Button
                  type='button'
                  rounded='full'
                  className='w-full'
                  loading={isBusy}
                  onClick={() => run(() => requestAccess(openApp.id, person))}
                >
                  Ask for access
                </Button>
                <p className='text-muted-foreground text-center text-xs'>
                  Your name and email go to whoever runs the app, who lets you
                  in once it's ready.
                </p>
              </div>
            )}
            {error ? <p className='text-destructive text-sm'>{error}</p> : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

export default RequestableApps;
