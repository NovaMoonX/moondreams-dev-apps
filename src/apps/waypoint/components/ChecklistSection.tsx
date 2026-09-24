import { useMemo, useState } from 'react';

import {
  Button,
  Checkbox,
  Tooltip,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { Badge } from '@moondreamsdev/dreamer-ui/components';

import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import AppToggle from '@/components/AppToggle';
import UserAvatar from '@/ui/UserAvatar';
import ChecklistItemFormModal from '@apps/waypoint/components/ChecklistItemFormModal';
import { CHECKLIST_CATEGORY_LABELS } from '@apps/waypoint/constants';
import type {
  ChecklistCategory,
  ChecklistItem,
  TripSpace,
} from '@apps/waypoint/types';
import {
  createChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
  updateChecklistItem,
} from '@apps/waypoint/store/actions/checklistActions';
import {
  canEditExistingItem,
  hasTripRole,
  isTripDateShiftLocked,
} from '@apps/waypoint/utils/roleGuards';

interface ChecklistSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

interface ChecklistDayGroup {
  dayIndex: number | null;
  items: ChecklistItem[];
}

function getChecklistCategoryLabel(item: ChecklistItem): string {
  return item.category === 'OTHER' && item.customCategoryLabel
    ? item.customCategoryLabel
    : (CHECKLIST_CATEGORY_LABELS[item.category] ?? CHECKLIST_CATEGORY_LABELS.OTHER);
}

export default function ChecklistSection({
  trip,
  currentUserId,
}: ChecklistSectionProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const items = useAppSelector((state) => state.waypoint.checklist.items);
  const memberIds = Object.keys(trip.members);
  const members = useUserInfo(memberIds)?.map ?? {};
  const canEdit =
    !isTripDateShiftLocked(trip) && hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const canEditExisting = canEditExistingItem(trip, currentUserId);

  const mayToggle = (item: ChecklistItem) =>
    !isTripDateShiftLocked(trip) &&
    (canEdit || item.assignedToUids.includes(currentUserId));

  const visibleItems = useMemo(
    () =>
      assignedToMeOnly
        ? items.filter((item) => item.assignedToUids.includes(currentUserId))
        : items,
    [assignedToMeOnly, currentUserId, items],
  );
  const dayGroups: ChecklistDayGroup[] = useMemo(
    () =>
      Array.from(
        visibleItems
          .reduce<Map<number | null, ChecklistItem[]>>((byDay, item) => {
            byDay.set(item.completeByDayIndex, [
              ...(byDay.get(item.completeByDayIndex) ?? []),
              item,
            ]);
            return byDay;
          }, new Map())
          .entries(),
      )
        .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
        .map(([dayIndex, dayItems]) => ({ dayIndex, items: dayItems })),
    [visibleItems],
  );

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

  const handleSave = async (values: {
    title: string;
    category: ChecklistCategory;
    customCategoryLabel: string | null;
    completeByDayIndex: number | null;
    note: string | null;
    assignedToUids: string[];
  }) => {
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await dispatch(
          updateChecklistItem({
            trip,
            uid: currentUserId,
            itemId: editingItem.id,
            ...values,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createChecklistItem({
            tripId: trip.id,
            uid: currentUserId,
            ...values,
          }),
        ).unwrap();
      }
      setIsModalOpen(false);
      setEditingItem(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: ChecklistItem) => {
    setIsSubmitting(true);
    try {
      await dispatch(
        deleteChecklistItem({ trip, uid: currentUserId, itemId: item.id }),
      ).unwrap();
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      addToast({
        title: 'Unable to delete checklist item',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
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
        {canEdit && (
          <Button
            onClick={() => {
              setEditingItem(null);
              setIsModalOpen(true);
            }}
          >
            Add item
          </Button>
        )}
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
        <AppToggle
          size='sm'
          checked={assignedToMeOnly}
          onCheckedChange={setAssignedToMeOnly}
        />
        Assigned to me
      </label>

      {dayGroups.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {items.length === 0
            ? 'No checklist items yet.'
            : 'No items match this filter.'}
        </p>
      ) : (
        <div className='space-y-4'>
          {dayGroups.map(({ dayIndex, items: dayItems }) => (
            <div key={dayIndex ?? 'no-day'} className='space-y-2'>
              <div className='flex items-center gap-3'>
                <div className='border-border flex-1 border-t' />
                <span className='text-muted-foreground text-sm font-medium'>
                  {dayIndex === null ? 'No specific day' : getDayLabel(trip.startDate, dayIndex)}
                </span>
                <div className='border-border flex-1 border-t' />
              </div>
              <ul className='divide-border divide-y'>
                {dayItems.map((item) => {
                  const assignedUsers = item.assignedToUids
                    .map((uid) => members[uid])
                    .filter(Boolean);

                  return (
                    <li
                      key={item.id}
                      className='flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0'
                    >
                      <div className='flex min-w-0 items-center gap-3'>
                        <Tooltip
                          message='Only assigned members or trip editors can update this item.'
                          placement='right'
                          disabled={mayToggle(item)}
                        >
                          {/* Checkbox doesn't forward children, so Tooltip's
                          child-cloning needs a plain wrapper to attach to. */}
                          <span className='inline-flex'>
                            <Checkbox
                              checked={item.isCompleted}
                              disabled={!mayToggle(item)}
                              onCheckedChange={(checked) =>
                                void handleToggle(item, checked)
                              }
                            />
                          </span>
                        </Tooltip>
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span
                              className={
                                item.isCompleted
                                  ? 'text-muted-foreground line-through'
                                  : 'font-medium'
                              }
                            >
                              {item.title}
                            </span>
                            <Badge variant='muted' outline>
                              {getChecklistCategoryLabel(item)}
                            </Badge>
                          </div>
                          {item.note && (
                            <p className='text-muted-foreground mt-1 text-sm italic'>{item.note}</p>
                          )}
                        </div>
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
                        {canEditExisting && (
                          <Button
                            type='button'
                            size='sm'
                            variant='secondary'
                            onClick={() => {
                              setEditingItem(item);
                              setIsModalOpen(true);
                            }}
                          >
                            Modify
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ChecklistItemFormModal
        key={`${editingItem?.id ?? 'new'}-${isModalOpen ? 'open' : 'closed'}`}
        isOpen={isModalOpen}
        trip={trip}
        item={editingItem}
        memberOptions={memberIds.map((uid) => ({
          label:
            members[uid]?.displayName?.trim() ||
            members[uid]?.email ||
            'Trip member',
          value: uid,
        }))}
        isSubmitting={isSubmitting}
        onSubmit={handleSave}
        onDelete={editingItem ? () => handleDelete(editingItem) : undefined}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
      />
    </section>
  );
}
