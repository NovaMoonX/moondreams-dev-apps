import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useMemo } from 'react';

import UserAvatar from '@/ui/UserAvatar';

import { useAuth } from '@/hooks/useAuth';
import { useUserInfo } from '@/hooks/useUserInfo';
import type { PendingMember, Space } from '../types';
import { getPartnerUid } from '../utils/spaceHelpers';

interface PendingApprovalModalProps {
  space: Space | null;
  isOpen: boolean;
  pendingMember: PendingMember | null;
  onApprove: () => Promise<unknown> | unknown;
  onDecline: () => Promise<unknown> | unknown;
  onClose?: () => void;
}

function PendingApprovalModal({
  space,
  isOpen,
  pendingMember,
  onApprove,
  onDecline,
  onClose,
}: PendingApprovalModalProps) {
  const { user } = useAuth();
  const partnerUid = getPartnerUid(space, user);
  const avatarUser = useUserInfo(partnerUid);

  const memberLabel = useMemo(
    () =>
      avatarUser?.displayName?.trim() ||
      avatarUser?.email ||
      pendingMember?.uid ||
      'This partner',
    [pendingMember?.uid, avatarUser],
  );

  const pendingUserEmail = avatarUser?.email?.trim();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title='Pending approval'
    >
      <div className='space-y-4'>
        <div className='border-border bg-muted/30 flex items-center gap-3 rounded-md border p-3'>
          <UserAvatar user={avatarUser} size='md' />
          <div className='min-w-0'>
            <div className='text-foreground truncate text-sm font-medium'>
              {memberLabel}
            </div>
            {pendingUserEmail && pendingUserEmail !== memberLabel && (
              <div className='text-muted-foreground truncate text-xs'>
                ({pendingUserEmail})
              </div>
            )}
          </div>
        </div>

        <p className='text-muted-foreground text-sm'>
          {memberLabel} wants to join your space. Approve to lock the room and
          start sharing, or decline the request.
        </p>
        <div className='flex gap-3 pt-2'>
          <Button variant='secondary' onClick={onDecline} className='flex-1'>
            Decline
          </Button>
          <Button onClick={onApprove} className='flex-1'>
            Approve
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default PendingApprovalModal;
