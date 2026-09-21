import { useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';

import { setSharedAlbumLink } from '@apps/waypoint/store/actions/tripActions';
import type { TripSpace } from '@apps/waypoint/types';

interface SharedAlbumLinkCardProps {
  trip: TripSpace;
  currentUserId: string;
}

function SharedAlbumLinkCard({
  trip,
  currentUserId,
}: SharedAlbumLinkCardProps) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [url, setUrl] = useState(trip.sharedAlbumUrl ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const canChangeExisting =
    trip.members[currentUserId]?.role === 'ADMIN' ||
    trip.members[currentUserId]?.role === 'EDITOR';
  const canSet = trip.sharedAlbumUrl === null || canChangeExisting;

  const saveUrl = async (nextUrl: string) => {
    setIsSaving(true);
    try {
      await dispatch(
        setSharedAlbumLink({
          uid: currentUserId,
          trip,
          url: nextUrl,
        }),
      ).unwrap();
      setIsEditing(false);
      addToast({
        title: nextUrl.trim()
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

  const handleSave = () => saveUrl(url);
  const handleClear = () => saveUrl('');

  return (
    <section className='border-border bg-card rounded-lg border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Shared album</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Keep the group&apos;s trip photos in one place.
          </p>
        </div>
        {!isEditing && canSet && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => setIsEditing(true)}
          >
            {trip.sharedAlbumUrl ? 'Change link' : 'Add link'}
          </Button>
        )}
      </div>
      {isEditing ? (
        <div className='mt-4 space-y-2'>
          <Label htmlFor={`album-link-${trip.id}`}>Album URL</Label>
          <Input
            id={`album-link-${trip.id}`}
            type='url'
            value={url}
            placeholder='https://photos.example.com/your-trip'
            onChange={(event) => setUrl(event.target.value)}
          />
          <div className='flex gap-2 pt-1'>
            <Button
              type='button'
              loading={isSaving}
              onClick={() => void handleSave()}
            >
              {isSaving ? 'Saving…' : 'Save link'}
            </Button>
            <Button
              type='button'
              variant='secondary'
              disabled={isSaving}
              onClick={() => {
                setUrl(trip.sharedAlbumUrl ?? '');
                setIsEditing(false);
              }}
            >
              Cancel
            </Button>
            {trip.sharedAlbumUrl && (
              <Button
                type='button'
                variant='link'
                disabled={isSaving}
                onClick={() => void handleClear()}
              >
                Clear link
              </Button>
            )}
          </div>
        </div>
      ) : trip.sharedAlbumUrl ? (
        <Button
          className='mt-4'
          href={trip.sharedAlbumUrl}
          target='_blank'
          rel='noreferrer'
          variant='link'
        >
          Open shared album
        </Button>
      ) : (
        <p className='text-muted-foreground mt-4 text-sm'>
          {canSet
            ? 'Add a Google Photos, Drive, or other album link for the group.'
            : 'An Editor or Admin can add the shared album link.'}
        </p>
      )}
    </section>
  );
}

export default SharedAlbumLinkCard;
