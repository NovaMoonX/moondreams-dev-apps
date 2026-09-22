import { useState } from 'react';

import { Button, Callout } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
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
      await dispatch(setSharedAlbumLink({ uid: currentUserId, trip, url })).unwrap();
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
      <Callout
        variant={shouldShowReminder ? 'info' : 'base'}
        icon='📷'
        title={<span className='font-bold'>Trip shared album</span>}
        className='text-sm'
        description={
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <span>{description}</span>
            <div className='flex shrink-0 gap-2 mr-1.5 mb-1 sm:mb-0'>
              {trip.sharedAlbumUrl && (
                <Button
                  href={trip.sharedAlbumUrl}
                  target='_blank'
                  rel='noreferrer'
                  variant='secondary'
                  size='sm'
                >
                  Open album
                </Button>
              )}
              {canSet && (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => setIsModalOpen(true)}
                >
                  {trip.sharedAlbumUrl ? 'Change link' : 'Add link'}
                </Button>
              )}
            </div>
          </div>
        }
      />
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
