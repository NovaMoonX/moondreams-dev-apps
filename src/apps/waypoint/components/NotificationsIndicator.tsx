import { useState } from 'react';

import { Badge, Button, Drawer, Popover } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Bell } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import IconBadge from '@/components/IconBadge';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatTime } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';

import { EventDetailLines } from '@apps/waypoint/components/EventCard';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
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

  if (totalCount === 0) {
    return null;
  }

  const dismissEvent = (event: TimelineEvent) => {
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
  };

  const dismissAll = () => {
    announcements.forEach((announcement) => {
      void dispatch(dismissAnnouncement({ uid: currentUserId, trip, announcementId: announcement.id }));
    });
    unseenEvents.forEach(dismissEvent);
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

  const content = (
    <div className='space-y-3'>
      <div className='max-h-[60vh] space-y-3 overflow-y-auto'>
        {announcements.map((announcement) => (
          <div key={announcement.id} className='border-border bg-card space-y-2 rounded-lg border p-3'>
            <div className='flex items-start justify-between gap-2'>
              <Badge variant='base' className={ANNOUNCEMENT_SEVERITY_BADGE_CLASSES[announcement.severity]}>
                {ANNOUNCEMENT_SEVERITY_LABELS[announcement.severity]}
              </Badge>
              {isAdmin && <DeleteIconButton onClick={() => void handleDeleteAnnouncement(announcement)} />}
            </div>
            <p className='font-semibold'>{announcement.title}</p>
            <p className='text-sm whitespace-pre-line'>{announcement.body}</p>
          </div>
        ))}
        {unseenEvents.map((event) => (
          <div key={event.id} className='border-border bg-card space-y-1 rounded-lg border p-3'>
            <p className='text-muted-foreground text-xs font-medium'>
              {event.createdAt >= trip.startDate ? 'New' : 'Updated'} · {formatTime(event.startAt)}
            </p>
            <EventDetailLines
              event={event}
              showTitle
              showNotes={false}
              showChangeHistory={false}
              canEdit={false}
              onSaveNotes={async () => {}}
            />
          </div>
        ))}
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
        <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title='Notifications'>
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
      className='w-80'
    >
      {content}
    </Popover>
  );
}

export default NotificationsIndicator;
