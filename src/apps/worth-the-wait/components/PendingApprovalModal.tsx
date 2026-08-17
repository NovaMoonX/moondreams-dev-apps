import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';

import type { PendingMember } from '../types';

type PendingApprovalModalProps = {
  isOpen: boolean;
  pendingMember: PendingMember | null;
  onApprove: () => Promise<unknown> | unknown;
  onDecline: () => Promise<unknown> | unknown;
  onClose?: () => void;
};

function PendingApprovalModal({
  isOpen,
  pendingMember,
  onApprove,
  onDecline,
  onClose,
}: PendingApprovalModalProps) {
  const memberLabel = pendingMember?.uid || 'This partner';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title='Pending approval'
      actions={[
        {
          label: 'Decline',
          variant: 'secondary',
          onClick: onDecline,
        },
        {
          label: 'Approve',
          onClick: onApprove,
        },
      ]}
    >
      <div className='space-y-4'>
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
