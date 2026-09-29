import { useState } from 'react';

import { Badge, Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useAppDispatch } from '@/store';
import { dismissAnnouncement } from '@apps/waypoint/store/actions/announcementActions';
import { ANNOUNCEMENT_SEVERITY_BADGE_CLASSES, ANNOUNCEMENT_SEVERITY_LABELS } from '@apps/waypoint/constants';
import type { Announcement, TripSpace } from '@apps/waypoint/types';

interface AnnouncementsListProps {
  trip: TripSpace;
  currentUserId: string;
  announcements: Announcement[];
}

function AnnouncementsList({ trip, currentUserId, announcements }: AnnouncementsListProps) {
  const dispatch = useAppDispatch();
  const [openAnnouncement, setOpenAnnouncement] = useState<Announcement | null>(null);

  const handleDismiss = async (announcement: Announcement) => {
    setOpenAnnouncement(null);
    await dispatch(
      dismissAnnouncement({ uid: currentUserId, trip, announcementId: announcement.id }),
    ).unwrap();
  };

  return (
    <div className='space-y-2'>
      {announcements.map((announcement) => (
        <Button
          key={announcement.id}
          type='button'
          variant='secondary'
          className={join(
            'flex h-auto w-full items-center justify-start gap-2 rounded-lg border p-3 text-left',
            announcement.severity === 'URGENT'
              ? 'border-red-500/60 bg-red-50 dark:bg-red-950/30'
              : announcement.severity === 'HEADS_UP'
                ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/30'
                : 'border-sky-500/60 bg-sky-50 dark:bg-sky-950/30',
          )}
          onClick={() => setOpenAnnouncement(announcement)}
        >
          <Badge variant='base' className={ANNOUNCEMENT_SEVERITY_BADGE_CLASSES[announcement.severity]}>
            {ANNOUNCEMENT_SEVERITY_LABELS[announcement.severity]}
          </Badge>
          <span className='min-w-0 flex-1 truncate text-sm font-medium'>{announcement.title}</span>
        </Button>
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
            <Button type='button' variant='secondary' onClick={() => void handleDismiss(openAnnouncement)}>
              Dismiss
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AnnouncementsList;
