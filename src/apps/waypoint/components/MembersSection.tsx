import { useState } from 'react';

import {
  Badge,
  Button,
  Drawer,
  RadioGroup,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from '@moondreamsdev/dreamer-ui/symbols';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch } from '@/store';
import UserAvatar from '@/ui/UserAvatar';
import { getErrorMessage } from '@/utils';
import {
  MEMBER_ROLE_DESCRIPTIONS,
  MEMBER_ROLE_LABELS,
} from '@apps/waypoint/constants';
import type { TripSpace, UserRole } from '@apps/waypoint/types';
import {
  changeRole,
  removeMember,
} from '@apps/waypoint/store/actions/membershipActions';
import MemberRoleBadge from './MemberRoleBadge';
import SectionHeader from '@/components/SectionHeader';
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
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const isSmallScreen = useMediaQuery().isBelow('sm');
  const allMemberIds = Object.keys(trip.members);
  const userInfo = useUserInfo(allMemberIds);
  const members = userInfo?.map ?? {};
  const isAdmin = trip.members[currentUserId]?.role === 'ADMIN';
  const activeMemberUid =
    activeMemberId && trip.members[activeMemberId] ? activeMemberId : null;
  const getDisplayName = (memberId: string) =>
    members[memberId]?.displayName?.trim() ||
    members[memberId]?.email ||
    'Trip member';
  const memberIds = [...allMemberIds].sort((first, second) => {
    if (first === trip.createdBy || second === trip.createdBy) {
      return first === trip.createdBy ? -1 : 1;
    }
    return getDisplayName(first).localeCompare(getDisplayName(second), undefined, {
      sensitivity: 'base',
    });
  });
  const roleOptions = Object.entries(MEMBER_ROLE_LABELS).map(
    ([value, text]) => ({ value, text }),
  );

  const handleRoleChange = async (
    memberId: string,
    role: UserRole,
    displayName: string,
  ) => {
    const currentRole = trip.members[memberId].role;
    if (role === currentRole) {
      return;
    }

    const confirmed = await confirm({
      title: 'Change role',
      message: (
        <div className='space-y-2'>
          <p>
            Change {displayName}&apos;s role to {MEMBER_ROLE_LABELS[role]}?
          </p>
          <p
            className={
              role === 'ADMIN'
                ? 'text-destructive text-sm'
                : 'text-muted-foreground text-sm'
            }
          >
            {MEMBER_ROLE_DESCRIPTIONS[role]}
          </p>
        </div>
      ),
      destructive: role === 'ADMIN',
    });
    if (!confirmed) {
      return;
    }

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
        <SectionHeader
          title='Members'
          subtitle={`${memberIds.length} ${memberIds.length === 1 ? 'member' : 'members'}`}
        />
        <ul className={join('divide-border', !isSmallScreen && 'divide-y')}>
          {memberIds.map((memberId) => {
            const member = members[memberId];
            const displayName =
              member?.displayName?.trim() || member?.email || 'Trip member';

            if (isSmallScreen) {
              const canManage =
                canChangeRole(trip, currentUserId, memberId) ||
                canRemoveMembers(trip, currentUserId, memberId);
              const roleLine = [
                MEMBER_ROLE_LABELS[trip.members[memberId].role],
                memberId === trip.createdBy ? 'Trip creator' : null,
              ]
                .filter(Boolean)
                .join(' · ');
              const content = (
                <>
                  <span className='flex min-w-0 flex-1 items-center gap-3 text-left'>
                    <span className='shrink-0'>
                      <UserAvatar user={member ?? null} size='md' />
                    </span>
                    <span className='min-w-0'>
                      <span className='block truncate font-medium'>
                        {displayName}
                      </span>
                      <span className='text-muted-foreground block text-xs font-normal'>
                        {roleLine}
                      </span>
                    </span>
                  </span>
                  {canManage && (
                    <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' />
                  )}
                </>
              );

              return (
                <li key={memberId}>
                  {canManage ? (
                    <Button
                      type='button'
                      variant='tertiary'
                      className='h-auto w-full justify-between gap-3 px-0! py-3!'
                      onClick={() => setActiveMemberId(memberId)}
                    >
                      {content}
                    </Button>
                  ) : (
                    <div className='flex items-center justify-between gap-3 py-3'>
                      {content}
                    </div>
                  )}
                </li>
              );
            }

            return (
              <li
                key={memberId}
                className='flex items-center justify-between gap-3 py-3'
              >
                <div className='flex items-center gap-3'>
                  <UserAvatar user={member ?? null} size='md' />
                  <span className='font-medium'>{displayName}</span>
                  {memberId === trip.createdBy && (
                    <Badge variant='muted' outline size='xs'>
                      Trip creator
                    </Badge>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  {canChangeRole(trip, currentUserId, memberId) ? (
                    <Select
                      size='sm'
                      options={roleOptions}
                      value={trip.members[memberId].role}
                      disabled={busyMemberId !== null}
                      onChange={(value) =>
                        void handleRoleChange(
                          memberId,
                          value as UserRole,
                          displayName,
                        )
                      }
                      aria-label={`Role for ${displayName}`}
                    />
                  ) : (
                    <MemberRoleBadge role={trip.members[memberId].role} />
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

      <Drawer
        isOpen={activeMemberUid !== null}
        onClose={() => setActiveMemberId(null)}
        title={activeMemberUid ? getDisplayName(activeMemberUid) : 'Member'}
        showCloseButton
        footer={
          activeMemberUid &&
          canRemoveMembers(trip, currentUserId, activeMemberUid) && (
            <div className='flex flex-col gap-2'>
              <Button
                type='button'
                size='lg'
                variant='secondary'
                className='text-destructive!'
                disabled={busyMemberId !== null}
                onClick={() =>
                  handleRemove(activeMemberUid, getDisplayName(activeMemberUid))
                }
              >
                Remove from trip
              </Button>
            </div>
          )
        }
      >
        {activeMemberUid && canChangeRole(trip, currentUserId, activeMemberUid) && (
          <div className='space-y-3 pb-2'>
            <p className='text-muted-foreground text-sm'>
              Pick what they can do on this trip.
            </p>
            <div className='flex justify-center py-2'>
              <RadioGroup
                value={trip.members[activeMemberUid].role}
                onChange={(value) =>
                  void handleRoleChange(
                    activeMemberUid,
                    value as UserRole,
                    getDisplayName(activeMemberUid),
                  )
                }
                options={roleOptions.map((option) => ({
                  label: option.text,
                  value: option.value,
                }))}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default MembersSection;
