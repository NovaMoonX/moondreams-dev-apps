import { useState } from 'react';

import { Input, Label, Modal } from '@moondreamsdev/dreamer-ui/components';

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
      actions={[
        ...(currentUrl
          ? [{ label: 'Clear link', variant: 'link' as const, disabled: isSaving, onClick: () => onSubmit('') }]
          : []),
        { label: 'Cancel', variant: 'secondary' as const, disabled: isSaving, onClick: onClose },
        {
          label: isSaving ? 'Saving…' : 'Save link',
          loading: isSaving,
          onClick: () => onSubmit(url),
        },
      ]}
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
      </div>
    </Modal>
  );
}

export default SharedAlbumLinkModal;
