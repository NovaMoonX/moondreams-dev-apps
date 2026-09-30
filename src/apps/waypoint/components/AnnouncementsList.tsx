import { useState } from 'react';

import { Badge, Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import {
  deleteAnnouncement,
  dismissAnnouncement,
} from '@apps/waypoint/store/actions/announcementActions';
import { ANNOUNCEMENT_SEVERITY_BADGE_CLASSES, ANNOUNCEMENT_SEVERITY_LABELS } from '@apps/waypoint/constants';
import type { Announcement, TripSpace } from '@apps/waypoint/types';
import { isTripAdmin } from '@apps/waypoint/utils/roleGuards';

interface AnnouncementsListProps {
  trip: TripSpace;
  currentUserId: string;
  announcements: Announcement[];
}

function AnnouncementsList({ trip, currentUserId, announcements }: AnnouncementsListProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [openAnnouncement, setOpenAnnouncement] = useState<Announcement | null>(null);
  const isAdmin = isTripAdmin(trip, currentUserId);

  const handleDismiss = async (announcement: Announcement) => {
    setOpenAnnouncement(null);
    await dispatch(
      dismissAnnouncement({ uid: currentUserId, trip, announcementId: announcement.id }),
    ).unwrap();
  };

  const dismissAll = () => {
    announcements.forEach((announcement) => {
      void dispatch(
        dismissAnnouncement({ uid: currentUserId, trip, announcementId: announcement.id }),
      );
    });
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
      setOpenAnnouncement(null);
    } catch (deleteError) {
      addToast({
        title: 'Unable to delete this announcement',
        description: getErrorMessage(deleteError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  const [firstAnnouncement, ...restAnnouncements] = announcements;

  return (
    <div className='border-border bg-muted/40 flex items-center gap-2 rounded-xl border p-2.5'>
      <Badge variant='base' className={ANNOUNCEMENT_SEVERITY_BADGE_CLASSES[firstAnnouncement.severity]}>
        {ANNOUNCEMENT_SEVERITY_LABELS[firstAnnouncement.severity]}
      </Badge>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className='h-auto min-h-0 min-w-0 flex-1 justify-start p-0! text-left'
        onClick={() => setOpenAnnouncement(firstAnnouncement)}
      >
        <span className='block min-w-0 truncate text-sm underline underline-offset-2'>
          {firstAnnouncement.title}
        </span>
      </Button>
      {restAnnouncements.length > 0 && (
        <span className='text-muted-foreground shrink-0 text-xs'>+{restAnnouncements.length} more</span>
      )}
      <Button
        type='button'
        variant='tertiary'
        size='icon'
        aria-label='Dismiss all announcements'
        className='text-muted-foreground hover:text-foreground size-5 shrink-0 bg-transparent! hover:bg-transparent!'
        onClick={dismissAll}
      >
        <X className='h-3.5 w-3.5' />
      </Button>
      <Modal
        isOpen={openAnnouncement !== null}
        onClose={() => setOpenAnnouncement(null)}
        title={openAnnouncement?.title ?? ''}
      >
        {openAnnouncement && (
          <div className='space-y-4'>
            <Badge
              variant='base'
              className={ANNOUNCEMENT_SEVERITY_BADGE_CLASSES[openAnnouncement.severity]}
            >
              {ANNOUNCEMENT_SEVERITY_LABELS[openAnnouncement.severity]}
            </Badge>
            <p className='text-sm whitespace-pre-line'>{openAnnouncement.body}</p>
            <ModalFooterActions
              leftActions={
                isAdmin && (
                  <DeleteIconButton onClick={() => void handleDelete(openAnnouncement)} />
                )
              }
              rightActions={
                <Button type='button' variant='secondary' onClick={() => void handleDismiss(openAnnouncement)}>
                  Dismiss
                </Button>
              }
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AnnouncementsList;
