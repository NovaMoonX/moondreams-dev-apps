import { useId, useRef } from 'react';

import { Avatar, Button } from '@moondreamsdev/dreamer-ui/components';

interface ImageUploadFieldProps {
  previewUrl: string | null;
  initials?: string;
  error?: string | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  onRemove: () => void;
}

/** Reusable avatar-style image picker: preview + change/remove, backed by `useImageUpload`. */
function ImageUploadField({
  previewUrl,
  initials,
  error,
  disabled = false,
  onSelect,
  onRemove,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className='flex items-center gap-4'>
      <Avatar src={previewUrl ?? undefined} initials={initials} size='lg' />
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <input
            ref={inputRef}
            id={inputId}
            type='file'
            accept='image/*'
            disabled={disabled}
            className='hidden'
            onChange={(event) => {
              onSelect(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Change photo
          </Button>
          {previewUrl && (
            <Button
              type='button'
              variant='link'
              size='sm'
              disabled={disabled}
              onClick={onRemove}
            >
              Remove
            </Button>
          )}
        </div>
        {error && <p className='text-sm text-red-500'>{error}</p>}
      </div>
    </div>
  );
}

export default ImageUploadField;
