import { useState } from 'react';

import { useAuth } from '@hooks/useAuth';

import Loading from '@/ui/Loading';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useNavigate } from 'react-router-dom';
import PendingApprovalModal from './components/PendingApprovalModal';
import SpaceOnboardingModal from './components/SpaceOnboardingModal';
import WorthTheWaitLayout from './components/WorthTheWaitLayout';
import { WorthTheWaitProvider } from './context/WorthTheWaitProvider';
import { useSpace } from './hooks/useSpace';

function WorthTheWait() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  // force the PendingApprovalModal open when user clicks PresenceBadge
  const [forceOpenPendingApprovalModal, setForceOpenPendingApprovalModal] =
    useState(false);
  const [hasOnboardingModalBeenDismissed, setHasOnboardingModalBeenDismissed] =
    useState(false);

  const hasSpace = Boolean(space && space.members.length >= 1);
  const creatorHasPendingApproval = Boolean(
    user && space && space.createdBy === user.uid && pendingMember,
  );
  const shouldOnboardingBeOpen =
    Boolean(user) && !hasSpace && !creatorHasPendingApproval;

  if (loading) {
    return <Loading />;
  }

  return (
    <>
      <PendingApprovalModal
        key={pendingMember?.uid ?? 'no-pending-member'}
        isOpen={
          forceOpenPendingApprovalModal ||
          (creatorHasPendingApproval && !hasPendingApprovalModalBeenDismissed)
        }
        pendingMember={pendingMember}
        onApprove={approvePendingMember}
        onDecline={declinePendingMember}
        onClose={() => {
          setHasPendingApprovalModalBeenDismissed(true);
          setForceOpenPendingApprovalModal(false);
        }}
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
        <div className='page relative pb-0!'>
          <Button
            onClick={() => setHasOnboardingModalBeenDismissed(false)}
            className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
          >
            Enter app
          </Button>
          <Button
            variant='link'
            onClick={() => navigate('/')}
            className='absolute top-1/2 left-1/2 -translate-x-1/2 mt-12'
          >
            Back home
          </Button>
        </div>
      )}

      {!shouldOnboardingBeOpen && (
        <WorthTheWaitProvider
          space={space}
          forceOpenPendingApprovalModal={() =>
            setForceOpenPendingApprovalModal(true)
          }
        >
          <WorthTheWaitLayout />
        </WorthTheWaitProvider>
      )}
    </>
  );
}

export default WorthTheWait;
