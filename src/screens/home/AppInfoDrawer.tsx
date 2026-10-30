import { Button, Drawer } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Star } from 'lucide-react';

import AppLogo from '@/components/AppLogo';
import type { AppMetadata } from '@lib/types/appCatalog';

interface AppInfoDrawerProps {
  app: AppMetadata | null;
  isStarred: boolean;
  onOpen: () => void;
  onToggleStar: (() => void) | null;
  onClose: () => void;
}

/** What a pressed-and-held tile shows: the app's description, Open, and its star. */
function AppInfoDrawer({ app, isStarred, onOpen, onToggleStar, onClose }: AppInfoDrawerProps) {
  return (
    <Drawer isOpen={app !== null} onClose={onClose} title={app?.name ?? ''} showCloseButton>
      {app ? (
        <div className='space-y-5 pb-4'>
          <div className='flex items-start gap-4'>
            <AppLogo appId={app.id} className='size-16 rounded-2xl shadow-sm' />
            <p className='text-foreground/70 min-w-0 flex-1 text-sm'>{app.description}</p>
          </div>
          <div className='flex flex-col gap-2'>
            <Button type='button' rounded='full' className='w-full' onClick={onOpen}>
              Open {app.name}
            </Button>
            {onToggleStar ? (
              <Button type='button' variant='secondary' rounded='full' className='w-full gap-2' onClick={onToggleStar}>
                <Star className={join('size-4', isStarred && 'text-primary fill-current')} aria-hidden='true' />
                {isStarred ? 'Unstar' : 'Star it'}
              </Button>
            ) : null}
            {onToggleStar ? (
              <p className='text-muted-foreground text-center text-xs'>
                Starred apps come first, here and in the menu.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

export default AppInfoDrawer;
