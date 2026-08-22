import NavButton from '@/ui/NavButton';
import { useAuth } from '@hooks/useAuth';
import {
  Button,
  CopyButton,
  HelpIcon,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { APP_REGISTRY_ID_MAP } from '@/lib/app';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';
import { useEffect, useMemo, useState } from 'react';
import { BoxProvider } from '../context/BoxProvider';
import { useWorthTheWait } from '../context/worthTheWaitContext';
import { useBoxes } from '../hooks/useBoxes';
import { useWelcomeModal } from '../hooks/useWelcomeModal';
import ActionAnimationModal from './ActionAnimationModal';
import BoxDetailDrawer from './BoxDetailDrawer';
import BoxGrid from './BoxGrid';
import ManageBoxModal from './ManageBoxModal';
import PresenceBadge from './PresenceBadge';
import SpaceWelcomeModal from './SpaceWelcomeModal';

function WorthTheWaitLayout() {
  const { user } = useAuth();
  const { activeAction, closeBox, selectedBoxId, space } = useWorthTheWait();
  const [isCreateBoxOpen, setIsCreateBoxOpen] = useState(false);
  const {
    isOpen: isWelcomeModalOpen,
    openManual,
    close,
  } = useWelcomeModal(space, user);

  const hasLockedSpace = Boolean(space && space.members.length >= 2);
  const {
    boxes,
    loading: boxesLoading,
    createCustomBox,
    editCustomBox,
    deleteBox,
  } = useBoxes(space?.id ?? '');
  const selectedBox = useMemo(
    () => boxes.find((box) => box.id === selectedBoxId) ?? null,
    [boxes, selectedBoxId],
  );

  useEffect(() => {
    if (
      activeAction &&
      activeAction.status !== 'completed' &&
      selectedBoxId === activeAction.boxId
    ) {
      closeBox();
    }
  }, [activeAction, closeBox, selectedBoxId]);

  return (
    <div className='page pt-28'>
      <div className={join('mx-auto max-w-6xl space-y-6')}>
        <header className='flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
          <NavButton href='/' variant='link'>
            <ChevronLeft /> Back home
          </NavButton>

          {space ? (
            <div className='flex items-center gap-3'>
              <PresenceBadge className='w-fit shrink-0 self-center' />
            </div>
          ) : null}
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
              <div className='bg-muted/40 border-border space-y-3 rounded-lg border p-4'>
                <p className='text-sm text-muted-foreground'>
                  Your shared space is waiting for both partners to join and
                  lock in.
                </p>
                {space?.inviteCode && (
                  <div className='flex items-center gap-2'>
                    <p className='text-xl'>
                      <b>Invite Code:</b> {space?.inviteCode}
                    </p>{' '}
                    <CopyButton textToCopy={space?.inviteCode} className='inline!' variant='base' size='icon' />
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {hasLockedSpace && (
            <div className='mt-8 space-y-5'>
              <div className='flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap'>
                <div>
                  <h2 className='text-foreground text-xl font-semibold'>
                    Shared boxes
                  </h2>
                  <p className='text-muted-foreground text-sm'>
                    Click on a box to view your items and add new ones.
                  </p>
                </div>
                <Button
                  type='button'
                  onClick={() => setIsCreateBoxOpen(true)}
                  className='w-full shrink-0 sm:w-auto'
                >
                  New box
                </Button>
              </div>

              {boxesLoading ? (
                <div className='text-muted-foreground text-sm'>
                  Loading boxes...
                </div>
              ) : (
                <BoxGrid
                  boxes={boxes}
                  onDeleteBox={deleteBox}
                  onEditBox={async (boxId, draft) => {
                    await editCustomBox(boxId, draft);
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Worth the Wait guide button */}
      {space ? (
        <Button
          variant='base'
          size='icon'
          aria-label='Open Worth the Wait guide'
          title='Open Worth the Wait guide'
          onClick={openManual}
          className='group border-border bg-background hover:bg-muted/40 fixed right-6 bottom-6 z-50 h-12 w-12 rounded-full! border shadow-lg transition-colors'
        >
          <HelpIcon
            message='Worth the Wait guide'
            placement='left'
            iconSize={18}
            className='group-hover:text-foreground! text-muted-foreground! transition-colors'
          />
        </Button>
      ) : null}

      <ManageBoxModal
        key={`create-box-modal-${isCreateBoxOpen}`}
        isOpen={isCreateBoxOpen}
        onClose={() => setIsCreateBoxOpen(false)}
        onCreate={async (draft) => {
          await createCustomBox(draft);
          setIsCreateBoxOpen(false);
        }}
      />

      <SpaceWelcomeModal
        key={`space-welcome-modal-${isWelcomeModalOpen}`}
        isOpen={isWelcomeModalOpen}
        onClose={close}
      />

      {selectedBox ? (
        <BoxProvider
          value={{
            box: selectedBox,
            spaceId: space?.id ?? '',
            onDelete: deleteBox,
            onEdit: editCustomBox,
          }}
        >
          <BoxDetailDrawer isOpen onClose={closeBox} />
        </BoxProvider>
      ) : null}

      <ActionAnimationModal boxes={boxes} />
    </div>
  );
}

export default WorthTheWaitLayout;
