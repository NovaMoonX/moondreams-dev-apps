import { useMemo, useState } from 'react';

import { useAuth } from '@hooks/useAuth';

import Loading from '@/ui/Loading';
import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PendingApprovalModal from './components/PendingApprovalModal';
import SpaceOnboardingModal from './components/SpaceOnboardingModal';
import WorthTheWaitLayout from './components/WorthTheWaitLayout';
import { WorthTheWaitProvider } from './context/WorthTheWaitProvider';
import { useBoxes } from './hooks/useBoxes';
import { useItems } from './hooks/useItems';
import { useMemberUpdates } from './hooks/useMemberUpdates';
import { useSpace } from './hooks/useSpace';
import {
  SPACE_CODE_LENGTH,
  SPACE_CODE_QUERY_PARAM,
} from './utils/generateCode';

function WorthTheWait() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

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
  const {
    boxes,
    loading: boxesLoading,
    createCustomBox,
    editCustomBox,
    deleteBox,
  } = useBoxes(space?.id ?? '', user?.uid ?? '');
  const boxIds = useMemo(() => boxes.map((box) => box.id), [boxes]);
  const {
    itemsByBoxId,
    getItemsByBoxId,
    loading: itemsLoading,
    addItem,
    deleteItem,
    updateItem,
    revealItem,
  } = useItems(space?.id ?? '', boxIds, user?.uid ?? '');
  const {
    summary: memberUpdateSummary,
    loading: memberUpdateLoading,
    markMemberUpdatesAsSeen,
  } = useMemberUpdates(
    space?.id ?? '',
    user?.uid ?? '',
    boxes,
    itemsByBoxId,
  );

  // only allow the search param to be used if it is a valid invite code
  const searchInviteCode = searchParams.get(SPACE_CODE_QUERY_PARAM)?.trim();
  const finalSearchInviteCode =
    searchInviteCode?.length === SPACE_CODE_LENGTH ? searchInviteCode : null;

  if (loading || boxesLoading || itemsLoading || memberUpdateLoading) {
    return <Loading />;
  }

  return (
    <>
      <PendingApprovalModal
        key={pendingMember?.uid ?? 'no-pending-member'}
        space={space}
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
        searchJoinCode={finalSearchInviteCode}
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
            className='absolute top-1/2 left-1/2 mt-12 -translate-x-1/2'
          >
            Back home
          </Button>
        </div>
      )}

      {!shouldOnboardingBeOpen && (
        <WorthTheWaitProvider
          space={space}
          boxes={boxes}
          boxesLoading={boxesLoading}
          createCustomBox={createCustomBox}
          editCustomBox={editCustomBox}
          deleteBox={deleteBox}
          itemsByBoxId={itemsByBoxId}
          getItemsByBoxId={getItemsByBoxId}
          itemsLoading={itemsLoading}
          addItem={addItem}
          deleteItem={deleteItem}
          updateItem={updateItem}
          revealItem={revealItem}
          memberUpdateSummary={memberUpdateSummary}
          memberUpdateLoading={memberUpdateLoading}
          markMemberUpdatesAsSeen={markMemberUpdatesAsSeen}
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
