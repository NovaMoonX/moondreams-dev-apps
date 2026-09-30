import { useState } from 'react';

import { Badge, Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
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

  return (
    <div className='space-y-2'>
      {announcements.map((announcement) => (
        <div
          key={announcement.id}
          role='button'
          tabIndex={0}
          className={join(
            'flex w-full items-center gap-2 rounded-lg border p-3 text-left cursor-pointer',
            announcement.severity === 'URGENT'
              ? 'border-red-500/60 bg-red-50 dark:bg-red-950/30'
              : announcement.severity === 'HEADS_UP'
                ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/30'
                : 'border-sky-500/60 bg-sky-50 dark:bg-sky-950/30',
          )}
          onClick={() => setOpenAnnouncement(announcement)}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              setOpenAnnouncement(announcement);
            }
          }}
        >
          <Badge variant='base' className={ANNOUNCEMENT_SEVERITY_BADGE_CLASSES[announcement.severity]}>
            {ANNOUNCEMENT_SEVERITY_LABELS[announcement.severity]}
          </Badge>
          <span className='min-w-0 flex-1 truncate text-sm font-medium'>{announcement.title}</span>
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            aria-label={`Dismiss ${announcement.title}`}
            className='shrink-0'
            onClick={(event) => {
              event.stopPropagation();
              void handleDismiss(announcement);
            }}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
      ))}
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
