import { useState } from 'react';

import { Badge, Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Bell } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import IconBadge from '@/components/IconBadge';
import { useNow } from '@/hooks/useNow';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { getDayLabel } from '@/utils/dateRangeUtils';
import { getErrorMessage } from '@/utils/errorUtils';

import { EventDetailLines } from '@apps/waypoint/components/EventCard';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import DismissIconButton from '@apps/waypoint/components/DismissIconButton';
import {
  deleteAnnouncement,
  dismissAnnouncement,
} from '@apps/waypoint/store/actions/announcementActions';
import { markEventSeen } from '@apps/waypoint/store/actions/eventActions';
import { selectLiveAnnouncements, selectUnseenActivityEvents } from '@apps/waypoint/store/selectors';
import { ANNOUNCEMENT_SEVERITY_BADGE_CLASSES, ANNOUNCEMENT_SEVERITY_LABELS } from '@apps/waypoint/constants';
import type { Announcement, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

interface NotificationsIndicatorProps {
  trip: TripSpace;
  currentUserId: string;
  isSmallScreen: boolean;
  className?: string;
}

interface EventActivity {
  label: 'Created' | 'Updated' | 'Archived';
  uid: string;
  at: number;
}

/** Whichever of create/edit/archive happened most recently is the activity this update describes. */
function getEventActivity(event: TimelineEvent, trip: TripSpace): EventActivity {
  const candidates: EventActivity[] = [];
  if (event.createdAt >= trip.startDate) {
    candidates.push({ label: 'Created', uid: event.createdBy, at: event.createdAt });
  }
  const lastChange = event.changeHistory.at(-1);
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

function NotificationsIndicator({ trip, currentUserId, isSmallScreen, className }: NotificationsIndicatorProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const announcements = useAppSelector(selectLiveAnnouncements(currentUserId, now), shallowEqual);
  const unseenEvents = useAppSelector(selectUnseenActivityEvents(trip, currentUserId), shallowEqual);
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = isTripAdmin(trip, currentUserId);
  const hasUrgent = announcements.some((announcement) => announcement.severity === 'URGENT');
  const totalCount = announcements.length + unseenEvents.length;
  const actorUids = Array.from(new Set(unseenEvents.map((event) => getEventActivity(event, trip).uid)));
  const actorsById = useUserInfo(actorUids)?.map ?? {};

  if (totalCount === 0) {
    return null;
  }

  const dismissOneAnnouncement = (announcement: Announcement) => {
    void dispatch(dismissAnnouncement({ uid: currentUserId, trip, announcementId: announcement.id }));
  };

  const dismissEvent = (event: TimelineEvent) => {
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
  };

  const dismissAllAnnouncements = () => {
    announcements.forEach(dismissOneAnnouncement);
  };

  const dismissAllUpdates = () => {
    unseenEvents.forEach(dismissEvent);
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
            <div className='space-y-3'>
              {announcements.map((announcement) => (
                <div key={announcement.id} className='border-border bg-card space-y-2 rounded-lg border p-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <Badge variant='base' className={ANNOUNCEMENT_SEVERITY_BADGE_CLASSES[announcement.severity]}>
                      {ANNOUNCEMENT_SEVERITY_LABELS[announcement.severity]}
                    </Badge>
                    <div className='flex items-center gap-1'>
                      {isAdmin && <DeleteIconButton onClick={() => void handleDeleteAnnouncement(announcement)} />}
                      <DismissIconButton onClick={() => dismissOneAnnouncement(announcement)} />
                    </div>
                  </div>
                  <p className='font-semibold'>{announcement.title}</p>
                  <p className='text-sm whitespace-pre-line'>{announcement.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {unseenEvents.length > 0 && (
          <div className='space-y-2'>
            {sectionHeading('Updates', dismissAllUpdates)}
            <div className='space-y-3'>
              {unseenEvents.map((event) => {
                const activity = getEventActivity(event, trip);
                const actorName = actorsById[activity.uid]?.displayName || actorsById[activity.uid]?.email || 'Someone';
                return (
                  <div key={event.id} className='border-border bg-card space-y-1 rounded-lg border p-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <p className='text-muted-foreground text-xs font-medium'>
                        {activity.label} · {getDayLabel(trip.startDate, event.dayIndex)} · by {actorName}
                      </p>
                      <DismissIconButton onClick={() => dismissEvent(event)} />
                    </div>
                    <EventDetailLines
                      event={event}
                      showTitle
                      showNotes={false}
                      showChangeHistory={false}
                      canEdit={false}
                      onSaveNotes={async () => {}}
                    />
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
