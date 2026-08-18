import { useState } from 'react';

import { useAuth } from '@hooks/useAuth';

import Loading from '@/ui/Loading';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import PendingApprovalModal from './components/PendingApprovalModal';
import SpaceOnboardingModal from './components/SpaceOnboardingModal';
import WorthTheWaitLayout from './components/WorthTheWaitLayout';
import { WorthTheWaitProvider } from './context/WorthTheWaitProvider';
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
  const [hasOnboardingModalBeenDismissed, setHasOnboardingModalBeenDismissed] =
    useState(false);

  const hasLockedSpace = Boolean(space && space.members.length >= 2);
  const creatorHasPendingApproval = Boolean(
    user && space && space.createdBy === user.uid && pendingMember,
  );
  const shouldOnboardingBeOpen =
    Boolean(user) && !hasLockedSpace && !creatorHasPendingApproval;
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
        isOpen={shouldOnboardingBeOpen && !hasOnboardingModalBeenDismissed}
        isSubmitting={isJoiningSpace || isCreatingSpace}
        hasJoinBeenSubmitted={joinRequestSent}
        onCreateSpace={createSpace}
        onJoinSpace={joinSpace}
        onClose={() => setHasOnboardingModalBeenDismissed(true)}
      />

      {shouldOnboardingBeOpen && hasOnboardingModalBeenDismissed && (
        <div className='page flex flex-col items-center justify-center'>
          <Button onClick={() => setHasOnboardingModalBeenDismissed(false)}>
            Enter app
          </Button>
        </div>
      )}

      {!shouldOnboardingBeOpen && (
        <WorthTheWaitProvider space={space}>
          <WorthTheWaitLayout />
        </WorthTheWaitProvider>
      )}
    </>
  );
}

export default WorthTheWait;
