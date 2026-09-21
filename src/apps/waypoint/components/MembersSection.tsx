import { useState } from 'react';

import { Button, Select } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch } from '@/store';
import UserAvatar from '@/ui/UserAvatar';
import { getErrorMessage } from '@/utils';
import {
  MEMBER_ROLE_LABELS,
  type TripSpace,
  type UserRole,
} from '@apps/waypoint/types';
import {
  changeRole,
  removeMember,
} from '@apps/waypoint/store/actions/membershipActions';
import MemberRoleBadge from './MemberRoleBadge';
import { canChangeRole, canRemoveMembers } from '@apps/waypoint/utils/roleGuards';

import PendingMembersPanel from './PendingMembersPanel';

interface MembersSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

function MembersSection({ trip, currentUserId }: MembersSectionProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const memberIds = Object.keys(trip.members);
  const userInfo = useUserInfo(memberIds);
  const members = userInfo?.map ?? {};
  const isAdmin = trip.members[currentUserId]?.role === 'ADMIN';
  const roleOptions = Object.entries(MEMBER_ROLE_LABELS).map(
    ([value, text]) => ({ value, text }),
  );

  const handleRoleChange = async (memberId: string, role: UserRole) => {
    setBusyMemberId(memberId);
    try {
      await dispatch(
        changeRole({
          tripId: trip.id,
          uid: memberId,
          role,
          currentUserId,
        }),
      ).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to change role',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemove = async (memberId: string, displayName: string) => {
    const confirmed = await confirm({
      title: 'Remove member',
      message: `Are you sure you want to remove ${displayName} from this trip?`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setBusyMemberId(memberId);
    try {
      await dispatch(
        removeMember({ tripId: trip.id, uid: memberId, currentUserId }),
      ).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to remove member',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <div className='space-y-6 pt-4'>
      <section className='space-y-3'>
        <h2 className='text-xl font-semibold'>Members</h2>
        <ul className='divide-border divide-y'>
          {memberIds.map((memberId) => {
            const member = members[memberId];
            const displayName =
              member?.displayName?.trim() || member?.email || 'Trip member';

            return (
              <li
                key={memberId}
                className='flex items-center justify-between gap-3 py-3'
              >
                <div className='flex items-center gap-3'>
                  <UserAvatar user={member ?? null} size='md' />
                  <span className='font-medium'>{displayName}</span>
                </div>
                <div className='flex items-center gap-2'>
                  <MemberRoleBadge role={trip.members[memberId].role} />
                  {canChangeRole(trip, currentUserId, memberId) && (
                    <Select
                      size='sm'
                      options={roleOptions}
                      value={trip.members[memberId].role}
                      disabled={busyMemberId !== null}
                      onChange={(value) =>
                        handleRoleChange(memberId, value as UserRole)
                      }
                      aria-label={`Role for ${displayName}`}
                    />
                  )}
                  {canRemoveMembers(trip, currentUserId, memberId) && (
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      disabled={busyMemberId !== null}
                      onClick={() => handleRemove(memberId, displayName)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isAdmin && <PendingMembersPanel tripId={trip.id} />}
    </div>
  );
}

export default MembersSection;
