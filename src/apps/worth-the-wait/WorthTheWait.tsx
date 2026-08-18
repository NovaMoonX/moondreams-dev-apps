import NavButton from '@/ui/NavButton';
import { useAuth } from '@hooks/useAuth';
import { useState } from 'react';

import Loading from '@/ui/Loading';
import PresenceBadge from './components/PresenceBadge';
import WorthTheWaitShell from './components/WorthTheWaitShell';
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
    isJoiningSpace,
    isCreatingSpace,
    joinRequestSent,
    declinePendingMember,
  } = useSpace(user?.uid ?? '');

  const [
    hasPendingApprovalModalBeenDismissed,
    setHasPendingApprovalModalBeenDismissed,
  ] = useState(false);

  const hasLockedSpace = Boolean(space && space.members.length >= 2);
  const creatorHasPendingApproval = Boolean(
    user && space && space.createdBy === user.uid && pendingMember,
  );
  const isOnboardingOpen =
    Boolean(user) && !hasLockedSpace && !creatorHasPendingApproval;
  const activePartnerUid =
    user && space
      ? space.members.find((memberUid) => memberUid !== user.uid) ?? null
      : null;
  const presencePartnerUid =
    activePartnerUid ?? (pendingMember ? pendingMember.uid : null);
  const showPendingBadge = Boolean(space && pendingMember && !activePartnerUid);

  if (loading) {
    return <Loading />;
  }

  return (
    <>
      <PendingApprovalModal
        key={pendingMember?.uid ?? 'no-pending-member'}
        isOpen={
          creatorHasPendingApproval && !hasPendingApprovalModalBeenDismissed
        }
        pendingMember={pendingMember}
        onApprove={approvePendingMember}
        onDecline={declinePendingMember}
        onClose={() => setHasPendingApprovalModalBeenDismissed(true)}
      />

      <SpaceOnboardingModal
        isOpen={isOnboardingOpen}
        isSubmitting={isJoiningSpace || isCreatingSpace}
        hasJoinBeenSubmitted={joinRequestSent}
        onCreateSpace={createSpace}
        onJoinSpace={joinSpace}
      />

      {!isOnboardingOpen && (
        <WorthTheWaitShell
          header={
            <>
              <NavButton href='/'>Back</NavButton>

              {space ? (
                <PresenceBadge
                  partnerUid={presencePartnerUid}
                  showPendingState={showPendingBadge}
                  className='shrink-0'
                />
              ) : null}
            </>
          }
        >
          <div className='max-w-xl space-y-5'>
            <h1 className='text-foreground text-4xl font-semibold tracking-tight md:text-5xl'>
              Worth the Wait
            </h1>
            <p className='text-foreground/70 max-w-lg text-base leading-7 md:text-lg'>
              A quiet place to hold what is on your mind and in your heart until
              the right moment to share it arrives.
            </p>

            {!hasLockedSpace && user ? (
              <div className='bg-muted/40 border-border text-muted-foreground rounded-lg border p-4 text-sm'>
                Your shared space is waiting for both partners to join and lock
                in.
              </div>
            ) : null}
          </div>
        </WorthTheWaitShell>
      )}
    </>
  );
}

export default WorthTheWait;
