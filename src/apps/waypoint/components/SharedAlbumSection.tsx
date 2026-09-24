import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ExternalLink, Settings2 } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';

import SharedAlbumLinkModal from '@apps/waypoint/components/SharedAlbumLinkModal';
import { setSharedAlbumLink } from '@apps/waypoint/store/actions/tripActions';
import { selectShouldShowAlbumReminder } from '@apps/waypoint/store/selectors';
import type { TripSpace } from '@apps/waypoint/types';

interface SharedAlbumSectionProps {
  trip: TripSpace;
  currentUserId: string;
}

function SharedAlbumSection({ trip, currentUserId }: SharedAlbumSectionProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const now = useNow();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const shouldShowReminder = useAppSelector((state) =>
    selectShouldShowAlbumReminder(state, trip.id, currentUserId, now),
  );
  const canChangeExisting =
    trip.members[currentUserId]?.role === 'ADMIN' ||
    trip.members[currentUserId]?.role === 'EDITOR';
  const canSet = trip.sharedAlbumUrl === null || canChangeExisting;

  const handleSave = async (url: string) => {
    setIsSaving(true);
    try {
      await dispatch(
        setSharedAlbumLink({ uid: currentUserId, trip, url }),
      ).unwrap();
      setIsModalOpen(false);
      addToast({
        title: url.trim()
          ? 'Shared album link saved.'
          : 'Shared album link removed.',
      });
    } catch (error) {
      addToast({
        title: 'Unable to save album link',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const description = shouldShowReminder
    ? trip.sharedAlbumUrl
      ? "Add today's photos to the album so everyone can relive the day."
      : "Add an album link so everyone can share today's photos."
    : trip.sharedAlbumUrl
      ? "Keep everyone's trip photos in one place."
      : canSet
        ? 'Add a link (Google Photos works great) to start capturing memories together.'
        : "An Editor or Admin can start the shared album whenever they're ready.";

  return (
    <>
      <div className='bg-muted/40 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm'>
        <span aria-hidden>📷</span>
        <div className='flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2'>
          <div className='min-w-0'>
            <p className='font-medium'>Shared album</p>
            <p
              className={join(
                shouldShowReminder
                  ? 'text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {description}
            </p>
          </div>
          <div className='flex shrink-0 flex-row-reverse items-center gap-1 sm:flex-row sm:gap-3'>
            {trip.sharedAlbumUrl && canSet && (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0'
                onClick={() => setIsModalOpen(true)}
              >
                <span className='hidden sm:inline'>Change</span>
                <Settings2 className='h-3.5 w-3.5 sm:hidden' />
              </Button>
            )}
            {trip.sharedAlbumUrl ? (
              <Button
                href={trip.sharedAlbumUrl}
                target='_blank'
                rel='noreferrer'
                size='sm'
              >
                Open album <ExternalLink className='h-3.5 w-3.5' />
              </Button>
            ) : (
              canSet && (
                <Button
                  type='button'
                  variant='primary'
                  size='sm'
                  onClick={() => setIsModalOpen(true)}
                  className='mr-1'
                >
                  Add link
                </Button>
              )
            )}
          </div>
        </div>
      </div>
      <SharedAlbumLinkModal
        key={isModalOpen ? 'open' : 'closed'}
        isOpen={isModalOpen}
        tripId={trip.id}
        currentUrl={trip.sharedAlbumUrl}
        isSaving={isSaving}
        onSubmit={(url) => void handleSave(url)}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

export default SharedAlbumSection;
