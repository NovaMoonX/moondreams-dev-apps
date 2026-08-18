import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import UserAvatar from '@/ui/UserAvatar';
import { db } from '@lib/firebase/config';

import type { PendingMember } from '../types';

type UserProfile = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
};

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
  const [pendingUser, setPendingUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!pendingMember?.uid) {
      return;
    }

    const userDocRef = doc(db, 'users', pendingMember.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      const data = docSnapshot.data() as Partial<UserProfile> | undefined;

      setPendingUser({
        uid: pendingMember.uid,
        displayName: data?.displayName ?? null,
        email: data?.email ?? null,
        photoURL: data?.photoURL ?? null,
      });
    });

    return () => unsubscribe();
  }, [pendingMember?.uid]);

  const memberLabel = useMemo(
    () =>
      pendingUser?.displayName?.trim() ||
      pendingUser?.email ||
      pendingMember?.uid ||
      'This partner',
    [pendingMember?.uid, pendingUser],
  );

  const pendingUserEmail = pendingUser?.email?.trim();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose ?? (() => undefined)}
      title='Pending approval'
    >
      <div className='space-y-4'>
        <div className='border-border bg-muted/30 flex items-center gap-3 rounded-md border p-3'>
          <UserAvatar user={pendingUser} size='md' />
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
