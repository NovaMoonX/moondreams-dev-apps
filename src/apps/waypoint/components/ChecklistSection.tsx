import { useMemo, useState, type KeyboardEvent } from 'react';

import {
  Button,
  Checkbox,
  Drawer,
  Tooltip,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';


import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getBucketLabel, getDayCount, groupByIndexBucket } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import AppToggle from '@/components/AppToggle';
import UserAvatar from '@/ui/UserAvatar';
import ChecklistItemFormModal from '@apps/waypoint/components/ChecklistItemFormModal';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import SearchInput from '@/components/SearchInput';
import { Lock, Users } from 'lucide-react';
import { CHECKLIST_CATEGORY_EMOJIS, CHECKLIST_CATEGORY_LABELS, LIST_SEARCH_THRESHOLD } from '@apps/waypoint/constants';
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
import { selectPersonalChecklistItems } from '@apps/waypoint/store/selectors';
import {
  canEditExistingItem,
  hasTripRole,
} from '@apps/waypoint/utils/roleGuards';

interface ChecklistSectionProps {
  trip: TripSpace;
  currentUserId: string;
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
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const isPhone = useMediaQuery().isBelow('sm');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [query, setQuery] = useState('');
  const sharedItems = useAppSelector((state) => state.waypoint.checklist.items);
  const personalItems = useAppSelector(selectPersonalChecklistItems);
  const items = useMemo(() => [...sharedItems, ...personalItems], [sharedItems, personalItems]);
  const privateIds = useMemo(() => new Set(personalItems.map((item) => item.id)), [personalItems]);
  const isPrivateItem = (item: ChecklistItem) => privateIds.has(item.id);
  const memberIds = Object.keys(trip.members);
  const members = useUserInfo(memberIds)?.map ?? {};
  const canEdit = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const canEditExisting = canEditExistingItem(trip, currentUserId);
  const mayModify = (item: ChecklistItem) => isPrivateItem(item) || canEditExisting;

  const mayToggle = (item: ChecklistItem) =>
    isPrivateItem(item) || canEdit || item.assignedToUids.includes(currentUserId);

  const showSearch = items.length >= LIST_SEARCH_THRESHOLD;
  const needle = showSearch ? query.trim().toLowerCase() : '';
  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (!assignedToMeOnly || privateIds.has(item.id) || item.assignedToUids.includes(currentUserId)) &&
          (needle === '' ||
            [item.title, item.note ?? '', getChecklistCategoryLabel(item)].some((text) =>
              text.toLowerCase().includes(needle),
            )),
      ),
    [assignedToMeOnly, currentUserId, items, needle, privateIds],
  );
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const dayGroups = useMemo(
    () => groupByIndexBucket(visibleItems, (item) => item.completeByDayIndex, dayCount, Number.POSITIVE_INFINITY),
    [visibleItems, dayCount],
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
          isPrivate: isPrivateItem(item),
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
    isPrivate: boolean;
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
            isPrivate: isPrivateItem(editingItem),
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
        deleteChecklistItem({ trip, uid: currentUserId, itemId: item.id, isPrivate: isPrivateItem(item) }),
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

  const detailItem = items.find((item) => item.id === detailItemId) ?? null;

  return (
    <section className='space-y-4 pt-4'>
      <SectionHeader
        title='Before the Road'
        subtitle={`${completedCount} of ${items.length} complete`}
        action={
          <Button
            onClick={() => {
              setEditingItem(null);
              setIsModalOpen(true);
            }}
          >
            Add
          </Button>
        }
      />
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
      {showSearch && <SearchInput value={query} onChange={setQuery} placeholder='Search the checklist' />}
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
          {dayGroups.map(({ bucket, items: dayItems }) => (
            <div key={bucket} className='space-y-2'>
              <SectionDivider label={getBucketLabel(bucket, trip.startDate, dayCount)} />
              <ul className='divide-border divide-y'>
                {dayItems.map((item) => {
                  const assignedUsers = item.assignedToUids
                    .map((uid) => members[uid])
                    .filter(Boolean);

                  return (
                    <li
                      key={item.id}
                      className='flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0'
                    >
                      <div className='flex min-w-0 items-start gap-3'>
                        <Tooltip
                          message='Only assigned members or trip editors can update this item.'
                          placement='right'
                          disabled={mayToggle(item)}
                        >
                          {/* Checkbox doesn't forward children, so Tooltip's
                          child-cloning needs a plain wrapper to attach to. */}
                          <span className='mt-0.5 inline-flex'>
                            <Checkbox
                              checked={item.isCompleted}
                              disabled={!mayToggle(item)}
                              onCheckedChange={(checked) =>
                                void handleToggle(item, checked)
                              }
                            />
                          </span>
                        </Tooltip>
                        <div
                          className={join('min-w-0', isPhone && mayModify(item) && 'cursor-pointer')}
                          {...(isPhone && mayModify(item)
                            ? {
                                role: 'button',
                                tabIndex: 0,
                                'aria-label': `Details for ${item.title}`,
                                onClick: () => setDetailItemId(item.id),
                                onKeyDown: (event: KeyboardEvent) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setDetailItemId(item.id);
                                  }
                                },
                              }
                            : {})}
                        >
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
                            {isPrivateItem(item) && (
                              <span
                                className='text-muted-foreground inline-flex items-center gap-1 text-xs whitespace-nowrap'
                                title='Only you see this'
                              >
                                <Lock className='h-3 w-3' aria-hidden='true' />
                                Just me
                              </span>
                            )}
                          </div>
                          <p className='text-muted-foreground mt-0.5 text-sm'>
                            <span aria-hidden='true'>{CHECKLIST_CATEGORY_EMOJIS[item.category] ?? CHECKLIST_CATEGORY_EMOJIS.OTHER}</span>{' '}
                            {getChecklistCategoryLabel(item)}
                          </p>
                          {item.note && (
                            <p className='text-muted-foreground mt-1 truncate text-sm italic'>{item.note}</p>
                          )}
                        </div>
                      </div>
                      <div className='flex shrink-0 items-center gap-1'>
                        {isPrivateItem(item) ? null : assignedUsers.length > 0 ? (
                          assignedUsers.map((user) => (
                            <UserAvatar key={user.uid} user={user} size='sm' />
                          ))
                        ) : (
                          <span
                            className='bg-secondary text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full'
                            title='Everyone'
                            role='img'
                            aria-label='Everyone'
                          >
                            <Users className='h-3.5 w-3.5' aria-hidden='true' />
                          </span>
                        )}
                        {mayModify(item) && !isPhone && (
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

      <Drawer
        isOpen={detailItem !== null}
        onClose={() => setDetailItemId(null)}
        title={detailItem?.title ?? 'Checklist item'}
        showCloseButton
        footer={
          <div className='flex flex-col gap-2'>
            <Button
              type='button'
              size='lg'
              variant='secondary'
              onClick={() => {
                setEditingItem(detailItem);
                setDetailItemId(null);
                setIsModalOpen(true);
              }}
            >
              Modify
            </Button>
          </div>
        }
      >
        {detailItem && (
          <div className='space-y-2 pb-2'>
            <p className='text-muted-foreground text-sm'>
              <span aria-hidden='true'>{CHECKLIST_CATEGORY_EMOJIS[detailItem.category] ?? CHECKLIST_CATEGORY_EMOJIS.OTHER}</span>{' '}
              {getChecklistCategoryLabel(detailItem)}
            </p>
            {detailItem.note && <p className='text-muted-foreground text-sm italic'>{detailItem.note}</p>}
          </div>
        )}
      </Drawer>

      <ChecklistItemFormModal
        key={`${editingItem?.id ?? 'new'}-${isModalOpen ? 'open' : 'closed'}`}
        isOpen={isModalOpen}
        trip={trip}
        item={editingItem}
        isItemPrivate={editingItem !== null && isPrivateItem(editingItem)}
        canShare={canEdit}
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
