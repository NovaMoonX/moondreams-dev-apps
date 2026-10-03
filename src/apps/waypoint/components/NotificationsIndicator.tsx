import { useState, type ReactNode } from 'react';

import { Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { AlertCircle, AlertTriangle, BedDouble, Bell, Info } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import IconBadge from '@/components/IconBadge';
import { useNow } from '@/hooks/useNow';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';

import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import DismissIconButton from '@apps/waypoint/components/DismissIconButton';
import { LocationLink } from '@apps/waypoint/components/LocationLink';
import {
  deleteAnnouncement,
  dismissAnnouncement,
} from '@apps/waypoint/store/actions/announcementActions';
import { markEventSeen } from '@apps/waypoint/store/actions/eventActions';
import { markStaySeen } from '@apps/waypoint/store/actions/stayActions';
import {
  getEventLastActivityAt,
  getStayLastActivityAt,
  selectLiveAnnouncements,
  selectUnseenActivityEvents,
  selectUnseenActivityStays,
} from '@apps/waypoint/store/selectors';
import { ANNOUNCEMENT_SEVERITY_LABELS } from '@apps/waypoint/constants';
import { getEventBadge } from '@apps/waypoint/utils/eventBadge';
import type { Announcement, AnnouncementSeverity, Stay, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';
import {
  formatEventStartTime,
  formatEventTimeRange,
  formatStayClockRange,
  getEventTime,
  getStayTime,
} from '@apps/waypoint/utils/tripTime';

// A soft tint of the severity color — the full-strength EVENT_TYPE_BADGE_CLASSES treatment
// is "normal," this is deliberately a notch lighter so it doesn't compete with it.
const ANNOUNCEMENT_SEVERITY_ICONS: Record<AnnouncementSeverity, { icon: typeof Info; chipClassName: string }> = {
  INFO: { icon: Info, chipClassName: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  HEADS_UP: { icon: AlertCircle, chipClassName: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  URGENT: { icon: AlertTriangle, chipClassName: 'bg-destructive/15 text-destructive' },
};

/** The small round icon chip every "What's new" row leads with — the one consistent visual
 * anchor across announcements and updates, whatever kind of item the row describes. */
function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={join('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm', className)}>
      {children}
    </span>
  );
}

function getUpdateItemChip(item: UpdateItem) {
  if (item.kind === 'event') {
    const badge = getEventBadge(item.data);
    return <Chip className={badge.className}>{badge.emoji}</Chip>;
  }
  return (
    <Chip className='bg-muted text-muted-foreground'>
      <BedDouble className='h-3.5 w-3.5' />
    </Chip>
  );
}

interface NotificationsIndicatorProps {
  trip: TripSpace;
  currentUserId: string;
  isSmallScreen: boolean;
  className?: string;
}

interface Activity {
  label: 'Created' | 'Updated' | 'Archived';
  uid: string;
  at: number;
}

/** Whichever of create/edit/archive happened most recently is the activity this update describes. */
function getEventActivity(event: TimelineEvent, trip: TripSpace): Activity {
  const candidates: Activity[] = [];
  if (event.createdAt >= trip.startDate) {
    candidates.push({ label: 'Created', uid: event.createdBy, at: event.createdAt });
  }
  const lastChange = (event.changeHistory ?? []).at(-1);
  if (lastChange) {
    candidates.push({ label: 'Updated', uid: lastChange.latestChangedBy, at: lastChange.latestChangedAt });
  }
  if (event.isArchived && event.archivedBy && event.archivedAt) {
    candidates.push({ label: 'Archived', uid: event.archivedBy, at: event.archivedAt });
  }

  return candidates.reduce(
    (latest, candidate) => (candidate.at > latest.at ? candidate : latest),
    { label: 'Created' as const, uid: event.createdBy, at: event.createdAt },
  );
}

// A stay has no archive concept, so it only ever reads as Created or Updated.
function getStayActivity(stay: Stay): Activity {
  const lastChange = (stay.changeHistory ?? []).at(-1);
  if (lastChange && lastChange.latestChangedAt >= stay.createdAt) {
    return { label: 'Updated', uid: lastChange.latestChangedBy, at: lastChange.latestChangedAt };
  }
  return { label: 'Created', uid: stay.createdBy, at: stay.createdAt };
}

type UpdateItem = { kind: 'event'; data: TimelineEvent } | { kind: 'stay'; data: Stay };

function getUpdateItemActivity(item: UpdateItem, trip: TripSpace): Activity {
  return item.kind === 'event' ? getEventActivity(item.data, trip) : getStayActivity(item.data);
}

function getUpdateItemLastActivityAt(item: UpdateItem, trip: TripSpace): number {
  return item.kind === 'event' ? getEventLastActivityAt(item.data, trip) : getStayLastActivityAt(item.data, trip);
}

function getUpdateItemKey(item: UpdateItem): string {
  return `${item.kind}-${item.data.id}`;
}

function getUpdateItemDayLabel(item: UpdateItem, trip: TripSpace): string {
  const dayIndex =
    item.kind === 'event'
      ? getEventTime(trip, item.data).dayIndex
      : getStayTime(trip, item.data).checkIn.dayIndex;
  return dayIndex === null ? 'No specific day' : getDayLabel(trip.startDate, dayIndex);
}

function getActivityVerb(label: Activity['label']) {
  if (label === 'Created') return 'added';
  if (label === 'Archived') return 'archived';
  return 'updated';
}

// Read as a notification — "so-and-so did X" as the headline, with the specifics (when/
// where) as muted subtext — rather than a structured record of every field on the item.
function renderUpdateItemBody(item: UpdateItem, activity: Activity, actorName: string, trip: TripSpace) {
  const title = item.kind === 'event' ? item.data.title : item.data.name;
  const headline = (
    <p className='text-sm'>
      <span className='font-medium'>{actorName}</span> {getActivityVerb(activity.label)}{' '}
      <span className='font-medium'>{title}</span>
    </p>
  );

  if (item.kind === 'event') {
    const event = item.data;
    if (activity.label === 'Archived') {
      return (
        <>
          {headline}
          <p className='text-muted-foreground text-xs'>
            Originally planned for {getUpdateItemDayLabel(item, trip)} at {formatEventStartTime(trip, event)}
          </p>
        </>
      );
    }

    const locationLabel = [event.locationName, event.address].filter(Boolean).join(' · ');
    return (
      <>
        {headline}
        <p className='text-muted-foreground text-xs'>
          {getUpdateItemDayLabel(item, trip)} · {formatEventTimeRange(trip, event)}
        </p>
        {locationLabel && <LocationLink {...event} label={locationLabel} className='text-xs' />}
      </>
    );
  }

  const stay = item.data;
  return (
    <>
      {headline}
      <p className='text-muted-foreground text-xs'>
        {getUpdateItemDayLabel(item, trip)} · {formatStayClockRange(trip, stay)}
      </p>
      {stay.address && (
        <LocationLink
          locationName={stay.stayType === 'HOTEL' ? stay.name : null}
          address={stay.address}
          latitude={stay.latitude}
          longitude={stay.longitude}
          label={stay.address}
          className='text-xs'
        />
      )}
    </>
  );
}

function NotificationsIndicator({ trip, currentUserId, isSmallScreen, className }: NotificationsIndicatorProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const announcements = useAppSelector(selectLiveAnnouncements(currentUserId, now), shallowEqual);
  const unseenEvents = useAppSelector(selectUnseenActivityEvents(trip, currentUserId), shallowEqual);
  const unseenStays = useAppSelector(selectUnseenActivityStays(trip, currentUserId), shallowEqual);
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = isTripAdmin(trip, currentUserId);
  const hasUrgent = announcements.some((announcement) => announcement.severity === 'URGENT');
  const updateItems: UpdateItem[] = [
    ...unseenEvents.map((event): UpdateItem => ({ kind: 'event', data: event })),
    ...unseenStays.map((stay): UpdateItem => ({ kind: 'stay', data: stay })),
  ]
    // You already know about your own activity — it's not "new" to you.
    .filter((item) => getUpdateItemActivity(item, trip).uid !== currentUserId)
    .sort((a, b) => getUpdateItemLastActivityAt(b, trip) - getUpdateItemLastActivityAt(a, trip));
  const totalCount = announcements.length + updateItems.length;
  const actorUids = Array.from(
    new Set([
      ...updateItems.map((item) => getUpdateItemActivity(item, trip).uid),
      ...announcements.map((announcement) => announcement.createdBy),
    ]),
  );
  const actorsById = useUserInfo(actorUids)?.map ?? {};
  const getActorName = (uid: string) => actorsById[uid]?.displayName || actorsById[uid]?.email || 'Someone';

  if (totalCount === 0) {
    return null;
  }

  const dismissOneAnnouncement = (announcement: Announcement) => {
    void dispatch(dismissAnnouncement({ uid: currentUserId, trip, announcementId: announcement.id }));
  };

  const dismissUpdateItem = (item: UpdateItem) => {
    if (item.kind === 'event') {
      void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: item.data.id }));
    } else {
      void dispatch(markStaySeen({ uid: currentUserId, trip, stayId: item.data.id }));
    }
  };

  const dismissAllAnnouncements = () => {
    // The person who posted an announcement can't dismiss it for themselves — only
    // delete it outright — so a bulk dismiss skips their own.
    announcements.filter((announcement) => announcement.createdBy !== currentUserId).forEach(dismissOneAnnouncement);
  };

  const dismissAllUpdates = () => {
    updateItems.forEach(dismissUpdateItem);
  };

  const dismissAll = () => {
    dismissAllAnnouncements();
    dismissAllUpdates();
    setIsOpen(false);
  };

  const handleDeleteAnnouncement = async (announcement: Announcement) => {
    const confirmed = await confirm({
      title: 'Delete announcement',
      message: `Delete "${announcement.title}"? This removes it for everyone and cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await dispatch(
        deleteAnnouncement({ uid: currentUserId, trip, announcementId: announcement.id }),
      ).unwrap();
    } catch (deleteError) {
      addToast({
        title: 'Unable to delete this announcement',
        description: getErrorMessage(deleteError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  const trigger = (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-label={`${totalCount} notification${totalCount === 1 ? '' : 's'}`}
      className={className}
      onClick={() => setIsOpen(isSmallScreen ? true : (open) => !open)}
    >
      <IconBadge icon={<Bell className='h-4 w-4' />} count={totalCount} urgent={hasUrgent} />
    </Button>
  );

  const sectionHeading = (label: string, onDismissSection: () => void) => (
    <div className='flex items-center justify-between'>
      <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>{label}</h3>
      <Button type='button' variant='link' size='sm' className='h-auto p-0 text-xs' onClick={onDismissSection}>
        Dismiss
      </Button>
    </div>
  );

  const content = (
    <div className='space-y-4'>
      <div className='max-h-[60vh] space-y-4 overflow-y-auto'>
        {announcements.length > 0 && (
          <div className='space-y-2'>
            {sectionHeading('Announcements', dismissAllAnnouncements)}
            <div className='divide-border divide-y'>
              {announcements.map((announcement) => {
                const isOwnAnnouncement = announcement.createdBy === currentUserId;
                const { icon: SeverityIcon, chipClassName } = ANNOUNCEMENT_SEVERITY_ICONS[announcement.severity];
                return (
                  <div
                    key={announcement.id}
                    className='flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0'
                  >
                    <Chip className={chipClassName}>
                      <SeverityIcon className='h-3.5 w-3.5' aria-label={ANNOUNCEMENT_SEVERITY_LABELS[announcement.severity]} />
                    </Chip>
                    <div className='min-w-0 flex-1 space-y-0.5'>
                      <p className='text-sm font-medium'>{announcement.title}</p>
                      <p className='text-muted-foreground text-xs whitespace-pre-line'>{announcement.body}</p>
                      <p className='text-muted-foreground text-right text-xs'>
                        - {getActorName(announcement.createdBy)}
                      </p>
                    </div>
                    <div className='flex shrink-0 items-center gap-1'>
                      {isAdmin && <DeleteIconButton onClick={() => void handleDeleteAnnouncement(announcement)} />}
                      {!isOwnAnnouncement && (
                        <DismissIconButton onClick={() => dismissOneAnnouncement(announcement)} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {updateItems.length > 0 && (
          <div className='space-y-2'>
            {sectionHeading('Updates', dismissAllUpdates)}
            <div className='divide-border divide-y'>
              {updateItems.map((item) => {
                const activity = getUpdateItemActivity(item, trip);
                const actorName = getActorName(activity.uid);
                return (
                  <div
                    key={getUpdateItemKey(item)}
                    className='flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0'
                  >
                    {getUpdateItemChip(item)}
                    <div className='min-w-0 flex-1 space-y-0.5'>
                      {renderUpdateItemBody(item, activity, actorName, trip)}
                    </div>
                    <DismissIconButton onClick={() => dismissUpdateItem(item)} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className='flex justify-end'>
        <Button type='button' size='sm' onClick={dismissAll}>
          Dismiss all
        </Button>
      </div>
    </div>
  );

  if (isSmallScreen) {
    return (
      <>
        {trigger}
        <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title="What's new">
          {content}
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      trigger={trigger}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement='bottom'
      alignment='end'
      className='w-80 p-3'
    >
      <div className='space-y-3'>
        <h2 className='font-semibold'>What&apos;s new</h2>
        <div className='text-sm'>{content}</div>
      </div>
    </Popover>
  );
}

export default NotificationsIndicator;
