import { useMemo, useState } from 'react';

import {
  Button,
  Checkbox,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import UserAvatar from '@/ui/UserAvatar';
import FormSection from '@/ui/FormSection';
import ChecklistItemFormModal from '@apps/waypoint/components/ChecklistItemFormModal';
import { CHECKLIST_CATEGORY_LABELS } from '@apps/waypoint/constants';
import type {
  ChecklistCategory,
  ChecklistItem,
  TripSpace,
} from '@apps/waypoint/types';
import {
  createChecklistItem,
  toggleChecklistItem,
} from '@apps/waypoint/store/actions/checklistActions';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';

interface ChecklistSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

interface ChecklistGroup {
  key: string;
  label: string;
  category: ChecklistCategory;
  items: ChecklistItem[];
}

export default function ChecklistSection({
  trip,
  currentUserId,
}: ChecklistSectionProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const items = useAppSelector((state) => state.waypoint.checklist.items);
  const memberIds = Object.keys(trip.members);
  const members = useUserInfo(memberIds)?.map ?? {};
  const canEdit = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);

  const mayToggle = (item: ChecklistItem) =>
    canEdit || item.assignedToUids.includes(currentUserId);

  const visibleItems = useMemo(
    () =>
      assignedToMeOnly
        ? items.filter((item) => item.assignedToUids.includes(currentUserId))
        : items,
    [assignedToMeOnly, currentUserId, items],
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, ChecklistGroup>();

    visibleItems.forEach((item) => {
      const label =
        item.category === 'OTHER'
          ? item.customCategoryLabel || CHECKLIST_CATEGORY_LABELS.OTHER
          : CHECKLIST_CATEGORY_LABELS[item.category];
      const key = `${item.category}:${label}`;
      const group = grouped.get(key);

      if (group) {
        group.items.push(item);
      } else {
        grouped.set(key, {
          key,
          label,
          category: item.category,
          items: [item],
        });
      }
    });

    return [...grouped.values()];
  }, [visibleItems]);

  const completedCount = items.filter((item) => item.isCompleted).length;
  const completionPercent =
    items.length === 0 ? 0 : Math.round((completedCount / items.length) * 100);

  const handleToggle = async (item: ChecklistItem, isCompleted: boolean) => {
    if (!mayToggle(item)) {
      return;
    }

    try {
      await dispatch(
        toggleChecklistItem({
          tripId: trip.id,
          itemId: item.id,
          uid: currentUserId,
          isCompleted,
        }),
      ).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to update checklist',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    }
  };

  const handleCreate = async (values: {
    title: string;
    category: ChecklistCategory;
    customCategoryLabel: string | null;
    assignedToUids: string[];
  }) => {
    setIsSubmitting(true);
    try {
      await dispatch(
        createChecklistItem({
          tripId: trip.id,
          uid: currentUserId,
          ...values,
        }),
      ).unwrap();
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className='space-y-4 pt-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold'>Before the Road</h2>
          <p className='text-muted-foreground text-sm'>
            {completedCount} of {items.length} complete
          </p>
        </div>
        {canEdit && <Button onClick={() => setIsModalOpen(true)}>Add item</Button>}
      </div>
      <div
        className='bg-muted h-2 overflow-hidden rounded-full'
        role='progressbar'
        aria-label={`${completionPercent}% complete`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completionPercent}
      >
        <div
          className='bg-primary h-full rounded-full transition-all'
          style={{ width: `${completionPercent}%` }}
        />
      </div>
      <label className='text-muted-foreground flex items-center gap-2 text-sm'>
        <Checkbox
          checked={assignedToMeOnly}
          onCheckedChange={setAssignedToMeOnly}
        />
        Assigned to me
      </label>

      {groups.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {items.length === 0
            ? 'No checklist items yet.'
            : 'No items match this filter.'}
        </p>
      ) : (
        <div className='space-y-3'>
          {groups.map((group) => (
            <FormSection
              key={group.key}
              label={`${group.label} (${group.items.length})`}
              defaultOpen
            >
              <ul className='divide-border divide-y'>
                {group.items.map((item) => {
                  const assignedUsers = item.assignedToUids
                    .map((uid) => members[uid])
                    .filter(Boolean);

                  return (
                    <li
                      key={item.id}
                      className='flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'
                    >
                      <div className='flex min-w-0 items-center gap-3'>
                        <Checkbox
                          checked={item.isCompleted}
                          disabled={!mayToggle(item)}
                          onCheckedChange={(checked) =>
                            void handleToggle(item, checked)
                          }
                        />
                        <span
                          className={
                            item.isCompleted
                              ? 'text-muted-foreground line-through'
                              : 'font-medium'
                          }
                        >
                          {item.title}
                        </span>
                      </div>
                      <div className='flex shrink-0 items-center gap-1'>
                        {assignedUsers.length > 0 ? (
                          assignedUsers.map((user) => (
                            <UserAvatar key={user.uid} user={user} size='sm' />
                          ))
                        ) : (
                          <span className='text-muted-foreground text-xs'>
                            Everyone
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </FormSection>
          ))}
        </div>
      )}

      <ChecklistItemFormModal
        isOpen={isModalOpen}
        memberOptions={memberIds.map((uid) => ({
          label:
            members[uid]?.displayName?.trim() ||
            members[uid]?.email ||
            'Trip member',
          value: uid,
        }))}
        isSubmitting={isSubmitting}
        onSubmit={handleCreate}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
}
