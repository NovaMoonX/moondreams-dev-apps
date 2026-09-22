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
    <div>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
        <span className='text-muted-foreground font-medium'>Shared album:</span>
        {trip.sharedAlbumUrl ? (
          <a
            href={trip.sharedAlbumUrl}
            target='_blank'
            rel='noreferrer'
            className='text-primary underline'
          >
            Open shared album
          </a>
        ) : (
          <span className='text-muted-foreground'>
            {canSet ? 'None yet' : 'None yet — ask an Editor or Admin'}
          </span>
        )}
        {!isEditing && canSet && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto p-0'
            onClick={() => setIsEditing(true)}
          >
            {trip.sharedAlbumUrl ? 'Change link' : 'Add link'}
          </Button>
        )}
      </div>
      {isEditing && (
        <div className='mt-2 space-y-2'>
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
              size='sm'
              loading={isSaving}
              onClick={() => void handleSave()}
            >
              {isSaving ? 'Saving…' : 'Save link'}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
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
                size='sm'
                disabled={isSaving}
                onClick={() => void handleClear()}
              >
                Clear link
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SharedAlbumLinkCard;
