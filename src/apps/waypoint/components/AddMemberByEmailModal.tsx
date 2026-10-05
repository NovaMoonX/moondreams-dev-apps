import { useState } from 'react';

import { Button, Input, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  ASSIGNABLE_MEMBER_ROLES,
  MEMBER_ROLE_DESCRIPTIONS,
  MEMBER_ROLE_EMOJIS,
  MEMBER_ROLE_LABELS,
} from '@apps/waypoint/constants';
import {
  addMemberByEmail,
  isValidEmail,
  normalizeEmail,
} from '@apps/waypoint/store/actions/emailInviteActions';
import type { TripEmailInvite, TripSpace } from '@apps/waypoint/types';

interface AddMemberByEmailModalProps {
  isOpen: boolean;
  trip: TripSpace;
  currentUserId: string;
  memberEmails: string[];
  onClose: () => void;
}

const ROLE_OPTIONS = ASSIGNABLE_MEMBER_ROLES.map((role) => ({
  value: role as TripEmailInvite['role'],
  label: MEMBER_ROLE_LABELS[role],
  emoji: MEMBER_ROLE_EMOJIS[role],
}));

/** Sets someone up ahead of time: no email goes out, and when they sign in with this address and open the trip they are in. */
function AddMemberByEmailModal({ isOpen, trip, currentUserId, memberEmails, onClose }: AddMemberByEmailModalProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TripEmailInvite['role']>('VIEWER');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeEmail(email);
  const isMember = memberEmails.some((memberEmail) => normalizeEmail(memberEmail) === normalized);
  const problem = isValidEmail(normalized) && isMember ? 'They are already on this trip.' : null;
  const canSave = isValidEmail(normalized) && !isMember && !isSaving;

  const handleAdd = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await dispatch(addMemberByEmail({ trip, uid: currentUserId, email: normalized, role })).unwrap();
      addToast({
        title: 'Added to the trip',
        description: `${normalized} joins as ${MEMBER_ROLE_LABELS[role]} once they sign in and open the trip.`,
        type: 'success',
      });
      onClose();
    } catch (addError) {
      setError(getErrorMessage(addError, 'Unable to add this person.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Member'>
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) {
            void handleAdd();
          }
        }}
      >
        <p className='text-muted-foreground text-sm'>
          Add their email and role now. We don&apos;t send anything: when they sign in with this address and open the
          trip, they&apos;re in without asking.
        </p>
        <Input
          type='email'
          variant='outline'
          aria-label='Email address'
          placeholder='name@example.com'
          value={email}
          autoFocus
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
        />
        <div className='space-y-2'>
          <PillGroup label='Role' options={ROLE_OPTIONS} value={role} onChange={setRole} />
          <p className='text-muted-foreground text-xs'>{MEMBER_ROLE_DESCRIPTIONS[role]}</p>
        </div>
        {(problem ?? error) && <p className='text-destructive text-sm'>{problem ?? error}</p>}
        <ModalFooterActions
          cancelAction={
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
          }
          rightActions={
            <Button type='submit' loading={isSaving} disabled={!canSave}>
                Add
              </Button>
          }
        />
      </form>
    </Modal>
  );
}

export default AddMemberByEmailModal;
