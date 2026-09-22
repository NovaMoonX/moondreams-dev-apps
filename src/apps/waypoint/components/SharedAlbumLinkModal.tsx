import { useState } from 'react';

import { Button, Input, Label, Modal } from '@moondreamsdev/dreamer-ui/components';

interface SharedAlbumLinkModalProps {
  isOpen: boolean;
  tripId: string;
  currentUrl: string | null;
  isSaving: boolean;
  onSubmit: (url: string) => void;
  onClose: () => void;
}

function SharedAlbumLinkModal({
  isOpen,
  tripId,
  currentUrl,
  isSaving,
  onSubmit,
  onClose,
}: SharedAlbumLinkModalProps) {
  const [url, setUrl] = useState(currentUrl ?? '');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Shared album link'
      disableCloseOnOverlayClick={isSaving}
    >
      <div className='space-y-2'>
        <Label htmlFor={`album-link-${tripId}`}>Album URL</Label>
        <Input
          id={`album-link-${tripId}`}
          type='url'
          value={url}
          placeholder='https://photos.example.com/your-trip'
          onChange={(event) => setUrl(event.target.value)}
        />
        <p className='text-muted-foreground text-xs'>
          Google Photos and Google Drive both work well.{' '}
          <strong className='font-semibold'>
            Make sure the album&apos;s sharing settings let others add photos
          </strong>
          , not just view them.
        </p>
      </div>
      <div className='mt-4 flex flex-nowrap items-center justify-between gap-2'>
        {currentUrl ? (
          <Button
            type='button'
            variant='link'
            disabled={isSaving}
            className='shrink-0'
            onClick={() => onSubmit('')}
          >
            <span className='sm:hidden'>Clear</span>
            <span className='hidden sm:inline'>Clear link</span>
          </Button>
        ) : (
          <span />
        )}
        <div className='flex shrink-0 gap-2'>
          <Button
            type='button'
            variant='secondary'
            disabled={isSaving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type='button' loading={isSaving} onClick={() => onSubmit(url)}>
            {isSaving ? 'Saving…' : 'Save link'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default SharedAlbumLinkModal;
