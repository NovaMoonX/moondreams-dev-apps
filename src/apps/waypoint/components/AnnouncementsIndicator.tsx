import { useState } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Megaphone } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';

import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import StepThroughModal from '@apps/waypoint/components/StepThroughModal';
import {
  deleteAnnouncement,
  dismissAnnouncement,
} from '@apps/waypoint/store/actions/announcementActions';
import { selectLiveAnnouncements } from '@apps/waypoint/store/selectors';
import { ANNOUNCEMENT_SEVERITY_BADGE_CLASSES, ANNOUNCEMENT_SEVERITY_LABELS } from '@apps/waypoint/constants';
import type { Announcement, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

interface AnnouncementsIndicatorProps {
  trip: TripSpace;
  currentUserId: string;
  className?: string;
}

function AnnouncementsIndicator({ trip, currentUserId, className }: AnnouncementsIndicatorProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const announcements = useAppSelector(selectLiveAnnouncements(currentUserId, now), shallowEqual);
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = isTripAdmin(trip, currentUserId);

  if (announcements.length === 0) {
    return null;
  }

  const dismiss = (announcement: Announcement) => {
    void dispatch(dismissAnnouncement({ uid: currentUserId, trip, announcementId: announcement.id }));
  };

  const dismissAll = () => {
    announcements.forEach(dismiss);
    setIsOpen(false);
  };

  const handleDelete = async (announcement: Announcement) => {
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

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        aria-label={`${announcements.length} announcement${announcements.length === 1 ? '' : 's'}`}
        className={className}
        onClick={() => setIsOpen(true)}
      >
        <Megaphone className='h-4 w-4' />
        <span className='text-xs'>{announcements.length}</span>
      </Button>
      <StepThroughModal
        isOpen={isOpen}
        title='Announcements'
        items={announcements}
        getKey={(announcement) => announcement.id}
        onDismissItem={dismiss}
        onDismissAll={dismissAll}
        onClose={() => setIsOpen(false)}
        renderItem={(announcement) => (
          <div className='space-y-3'>
            <Badge variant='base' className={ANNOUNCEMENT_SEVERITY_BADGE_CLASSES[announcement.severity]}>
              {ANNOUNCEMENT_SEVERITY_LABELS[announcement.severity]}
            </Badge>
            <p className='font-semibold'>{announcement.title}</p>
            <p className='text-sm whitespace-pre-line'>{announcement.body}</p>
            {isAdmin && (
              <DeleteIconButton onClick={() => void handleDelete(announcement)} />
            )}
          </div>
        )}
      />
    </>
  );
}

export default AnnouncementsIndicator;
