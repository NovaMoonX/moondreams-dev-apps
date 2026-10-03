import { useId, useRef, useState } from 'react';

import { Avatar, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

export type PhotoPickerVariant = 'minimal' | 'enhanced';

interface PhotoPickerProps {
  /** The chosen photo; drives the Change/Remove buttons. */
  photoUrl: string | null;
  /** Shown in the preview while there is no `photoUrl` (e.g. an account photo that a chosen one would override). */
  fallbackUrl?: string | null;
  initials?: string;
  error?: string | null;
  disabled?: boolean;
  loading?: boolean;
  /** `minimal`: avatar + buttons. `enhanced`: large preview, drag-and-drop zone and helper text. */
  variant?: PhotoPickerVariant;
  /** Minimal variant only: set false when the caller already renders its own preview bound to the same `photoUrl`. */
  showPreview?: boolean;
  onSelect: (file: File | null) => void;
  onRemove: () => void;
}

/** Reusable photo picker: preview + change/remove, backed by `useImageUpload`. */
function PhotoPicker({
  photoUrl,
  fallbackUrl = null,
  initials,
  error,
  disabled = false,
  loading = false,
  variant = 'minimal',
  showPreview = true,
  onSelect,
  onRemove,
}: PhotoPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isBusy = disabled || loading;
  const shownUrl = photoUrl ?? fallbackUrl;

  const fileInput = (
    <input
      ref={inputRef}
      id={inputId}
      type='file'
      accept='image/*'
      disabled={isBusy}
      className='hidden'
      onChange={(event) => {
        onSelect(event.target.files?.[0] ?? null);
        event.target.value = '';
      }}
    />
  );

  const buttons = (
    <div className='flex items-center gap-2'>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        disabled={isBusy}
        onClick={() => inputRef.current?.click()}
      >
        {photoUrl ? 'Change photo' : 'Upload photo'}
      </Button>
      {photoUrl && (
        <Button
          type='button'
          variant='link'
          size='sm'
          disabled={isBusy}
          onClick={onRemove}
        >
          Remove
        </Button>
      )}
    </div>
  );

  const errorText = error && <p className='text-sm text-red-500'>{error}</p>;

  if (variant === 'enhanced') {
    return (
      <div
        className={join(
          'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-border',
          isBusy && 'opacity-70',
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isBusy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!isBusy) onSelect(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        {fileInput}
        <Avatar
          src={shownUrl ?? undefined}
          initials={shownUrl ? undefined : initials}
          size='2xl'
          shape='circle'
        />
        {buttons}
        <p className='text-muted-foreground text-xs'>
          {isDragging
            ? 'Drop it right here'
            : 'Drag a photo here, or browse. JPG, PNG or GIF up to 5MB.'}
        </p>
        {errorText}
      </div>
    );
  }

  return (
    <div
      className={join(
        'flex gap-1',
        showPreview ? 'items-center gap-4' : 'flex-col items-center',
      )}
    >
      {fileInput}
      {showPreview && (
        <Avatar src={shownUrl ?? undefined} initials={initials} size='lg' />
      )}
      <div className='flex flex-col items-center gap-1'>
        {buttons}
        {errorText}
      </div>
    </div>
  );
}

export default PhotoPicker;
