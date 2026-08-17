import NavButton from '@/ui/NavButton';
import { useAuth } from '@hooks/useAuth';

import PendingApprovalModal from './components/PendingApprovalModal';
import SpaceOnboardingModal from './components/SpaceOnboardingModal';
import { useSpace } from './hooks/useSpace';

function WorthTheWait() {
  const { user } = useAuth();
  const {
    space,
    pendingMember,
    loading,
    createSpace,
    joinSpace,
    approvePendingMember,
    declinePendingMember,
  } = useSpace(user?.uid ?? '');

  const hasLockedSpace = Boolean(space && space.members.length >= 2);
  const isCreatorPendingApproval = Boolean(
    user && space && space.createdBy === user.uid && pendingMember,
  );
  const isOnboardingOpen = Boolean(user) && !hasLockedSpace && !isCreatorPendingApproval;

  if (loading) {
    return (
      <div className='page flex items-center justify-center px-4 py-12'>
        <div className='w-full max-w-xl'>
          <div className='mb-6'>
            <NavButton href='/'>Back</NavButton>
          </div>

          <main className='space-y-5'>
            <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
              Loading your space
            </p>
          </main>
        </div>
      </div>
    );
  }

  return (
    <>
      <PendingApprovalModal
        isOpen={isCreatorPendingApproval}
        pendingMember={pendingMember}
        onApprove={approvePendingMember}
        onDecline={declinePendingMember}
        onClose={declinePendingMember}
      />

      <SpaceOnboardingModal
        isOpen={isOnboardingOpen}
        inviteCode={space?.inviteCode ?? ''}
        onClose={() => undefined}
        onCreateSpace={createSpace}
        onJoinSpace={joinSpace}
      />

      <div className='page flex items-center justify-center px-4 py-12'>
        <div className='w-full max-w-xl'>
          <div className='mb-6'>
            <NavButton href='/'>Back</NavButton>
          </div>

          <main className='space-y-5'>
            <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
              Mini app
            </p>
            <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-5xl'>
              Worth the Wait
            </h1>
            <p className='text-foreground/70 max-w-lg text-base leading-7 md:text-lg'>
              A quiet place to hold what is on your mind and in your heart until
              the right moment to share it arrives.
            </p>

            {!hasLockedSpace && user ? (
              <div className='bg-muted/40 border-border rounded-lg border p-4 text-sm text-muted-foreground'>
                Your shared space is waiting for both partners to join and lock in.
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </>
  );
}

export default WorthTheWait;
