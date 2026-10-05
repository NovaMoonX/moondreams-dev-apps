import { useState } from 'react';
import { shallowEqual } from 'react-redux';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import { PillGroup } from '@/components/PillGroup';
import SectionDivider from '@/components/SectionDivider';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  ASSIGNABLE_MEMBER_ROLES,
  MEMBER_ROLE_DESCRIPTIONS,
  MEMBER_ROLE_EMOJIS,
  MEMBER_ROLE_LABELS,
} from '@apps/waypoint/constants';
import {
  inviteMemberByEmail,
  isValidEmail,
  normalizeEmail,
  removeEmailInvite,
} from '@apps/waypoint/store/actions/emailInviteActions';
import type { TripEmailInvite, TripSpace } from '@apps/waypoint/types';

interface EmailInvitesPanelProps {
  trip: TripSpace;
  currentUserId: string;
  /** Emails of the people already on the trip, so inviting one of them is caught up front. */
  memberEmails: string[];
}

const ROLE_OPTIONS = ASSIGNABLE_MEMBER_ROLES.map((role) => ({
  value: role as TripEmailInvite['role'],
  label: MEMBER_ROLE_LABELS[role],
  emoji: MEMBER_ROLE_EMOJIS[role],
}));

/** An Admin's way to say yes to someone before they ask: an email address and the role they'll join with. */
function EmailInvitesPanel({ trip, currentUserId, memberEmails }: EmailInvitesPanelProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const invites = useAppSelector(
    (state) => state.waypoint.emailInvites.forTrip.filter((invite) => invite.tripId === trip.id),
    shallowEqual,
  );
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TripEmailInvite['role']>('VIEWER');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeEmail(email);
  const isMember = memberEmails.some((memberEmail) => normalizeEmail(memberEmail) === normalized);
  const getProblem = () => {
    if (normalized === '' || !isValidEmail(normalized)) {
      return null;
    }
    return isMember ? 'They are already on this trip.' : null;
  };
  const problem = getProblem();
  const canSend = isValidEmail(normalized) && !isMember && !isSending;

  const handleInvite = async () => {
    setIsSending(true);
    setError(null);
    try {
      await dispatch(inviteMemberByEmail({ trip, uid: currentUserId, email: normalized, role })).unwrap();
      addToast({
        title: 'They\'re on the list',
        description: `${normalized} can join as ${MEMBER_ROLE_LABELS[role]} the moment they open the trip link.`,
        type: 'success',
      });
      setEmail('');
    } catch (inviteError) {
      setError(getErrorMessage(inviteError, 'Unable to save this invitation.'));
    } finally {
      setIsSending(false);
    }
  };

  const handleRemove = async (invite: TripEmailInvite) => {
    const confirmed = await confirm({
      title: 'Cancel invitation',
      message: `Take ${invite.email} off the list? They'll need to ask to join instead.`,
      confirmText: 'Cancel invitation',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await dispatch(removeEmailInvite({ tripId: invite.tripId, email: invite.email })).unwrap();
    } catch (removeError) {
      addToast({
        title: 'Unable to cancel this invitation',
        description: getErrorMessage(removeError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  return (
    <section className='space-y-4'>
      <SectionDivider label='Invite by email' />
      <p className='text-muted-foreground text-sm'>
        Add someone&apos;s email and role now. When they sign in with it and open the trip link, they join straight
        away, with no waiting for approval.
      </p>
      <div className='space-y-3'>
        <Input
          type='email'
          variant='outline'
          aria-label='Email address'
          placeholder='friend@example.com'
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
        />
        <PillGroup label='Role' options={ROLE_OPTIONS} value={role} onChange={setRole} />
        <p className='text-muted-foreground text-xs'>{MEMBER_ROLE_DESCRIPTIONS[role]}</p>
        {(problem ?? error) && <p className='text-destructive text-sm'>{problem ?? error}</p>}
        <div className='flex justify-end'>
          <Button type='button' rounded='full' loading={isSending} disabled={!canSend} onClick={() => void handleInvite()}>
            Invite
          </Button>
        </div>
      </div>
      {invites.length > 0 && (
        <ul className='divide-border divide-y'>
          {[...invites]
            .sort((first, second) => first.email.localeCompare(second.email))
            .map((invite) => (
              <li key={invite.email} className='flex items-center justify-between gap-3 py-2.5'>
                <div className='flex min-w-0 items-center gap-3'>
                  <span aria-hidden className='bg-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
                    💌
                  </span>
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>{invite.email}</p>
                    <p className='text-muted-foreground text-xs'>
                      Invited as {MEMBER_ROLE_LABELS[invite.role]} · hasn&apos;t joined yet
                    </p>
                  </div>
                </div>
                <Button
                  type='button'
                  variant='tertiary'
                  size='icon'
                  aria-label={`Cancel invitation for ${invite.email}`}
                  onClick={() => void handleRemove(invite)}
                >
                  <X className='h-4 w-4' />
                </Button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

export default EmailInvitesPanel;
