import NavButton from '@/ui/NavButton';
import { useAuth } from '@hooks/useAuth';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { APP_REGISTRY_ID_MAP } from '@/lib/app';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';
import { useState } from 'react';
import { useWorthTheWait } from '../context/worthTheWaitContext';
import { useBoxes } from '../hooks/useBoxes';
import BoxGrid from './BoxGrid';
import CreateBoxModal from './CreateBoxModal';
import PresenceBadge from './PresenceBadge';

function WorthTheWaitLayout() {
  const { user } = useAuth();
  const { space } = useWorthTheWait();
  const [isCreateBoxOpen, setIsCreateBoxOpen] = useState(false);

  const hasLockedSpace = Boolean(space && space.members.length >= 2);
  const {
    boxes,
    loading: boxesLoading,
    createCustomBox,
    deleteBox,
  } = useBoxes(space?.id ?? '');

  return (
    <div className='page pt-28'>
      <div className={join('mx-auto max-w-6xl space-y-6')}>
        <header className='flex items-start justify-between gap-4'>
          <NavButton href='/' variant='link'>
            <ChevronLeft /> Back home
          </NavButton>

          {space ? <PresenceBadge className='shrink-0' /> : null}
        </header>

        <main className='bg-card/80 border-border rounded-2xl border p-5 shadow-sm md:p-8'>
          <div className='max-w-xl space-y-5'>
            <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-5xl'>
              Worth the Wait
            </h1>
            <p className='text-foreground/70 max-w-lg text-base leading-7 md:text-lg'>
              {APP_REGISTRY_ID_MAP['worth-the-wait']?.description}
            </p>

            {!hasLockedSpace && user ? (
              <div className='bg-muted/40 border-border text-muted-foreground rounded-lg border p-4 text-sm'>
                Your shared space is waiting for both partners to join and lock
                in.
              </div>
            ) : null}
          </div>

          {hasLockedSpace && (
            <div className='mt-8 space-y-5'>
              <div className='flex items-center justify-between gap-4'>
                <div>
                  <h2 className='text-foreground text-xl font-semibold'>
                    Shared boxes
                  </h2>
                  <p className='text-muted-foreground text-sm'>
                    Keep your hopes, memories, and wishes tucked away until the
                    right time.
                  </p>
                </div>
                <Button type='button' onClick={() => setIsCreateBoxOpen(true)}>
                  New box
                </Button>
              </div>

              {boxesLoading ? (
                <div className='text-muted-foreground text-sm'>
                  Loading boxes...
                </div>
              ) : (
                <BoxGrid boxes={boxes} onDeleteBox={deleteBox} />
              )}
            </div>
          )}
        </main>
      </div>

      <CreateBoxModal
        isOpen={isCreateBoxOpen}
        onClose={() => setIsCreateBoxOpen(false)}
        onCreate={async (draft) => {
          await createCustomBox(draft);
          setIsCreateBoxOpen(false);
        }}
      />
    </div>
  );
}

export default WorthTheWaitLayout;
