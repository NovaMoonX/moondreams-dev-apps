import { useState } from 'react';

import { Button, Input, Label, Modal } from '@moondreamsdev/dreamer-ui/components';
import { ExternalLink } from 'lucide-react';

interface SharedAlbumLinkModalProps {
  isOpen: boolean;
  tripId: string;
  currentUrl: string | null;
  /** Only Admins and Editors may change a link that is already set. */
  canChange: boolean;
  /** Opens on the link field instead of the album view (the card's "Change"). */
  startChanging?: boolean;
  isSaving: boolean;
  onSubmit: (url: string) => void;
  onClose: () => void;
}

function SharedAlbumLinkModal({
  isOpen,
  tripId,
  currentUrl,
  canChange,
  startChanging = false,
  isSaving,
  onSubmit,
  onClose,
}: SharedAlbumLinkModalProps) {
  const [url, setUrl] = useState(currentUrl ?? '');
  const [isChanging, setIsChanging] = useState(currentUrl === null || startChanging);
  const isViewing = currentUrl !== null && !isChanging;

  if (isViewing) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title='Shared album'>
        <p className='text-muted-foreground text-sm'>
          Everyone&apos;s trip photos in one place. Add yours from the album.
        </p>
        <div className='mt-4 space-y-2'>
          <Button href={currentUrl} target='_blank' rel='noreferrer' size='lg' className='w-full'>
            Open album <ExternalLink className='h-3.5 w-3.5' />
          </Button>
          <div className='flex items-center justify-between gap-2'>
            {canChange ? (
              <Button type='button' variant='secondary' onClick={() => setIsChanging(true)}>
                Change link
              </Button>
            ) : (
              <span />
            )}
            <Button type='button' variant='tertiary' onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

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
            onClick={currentUrl ? () => setIsChanging(false) : onClose}
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
