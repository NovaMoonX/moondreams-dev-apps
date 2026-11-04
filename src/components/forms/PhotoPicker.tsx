import { useId, useRef, useState, type ReactNode } from 'react';

import { Avatar, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import FallbackImage from '@/components/FallbackImage';
import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { openFileChooser } from '@/utils/fileUtils';

export type PhotoPickerVariant = 'minimal' | 'enhanced' | 'cover';

interface PhotoPickerProps {
  photoUrl: string | null;
  fallbackUrl?: string | null;
  initials?: string;
  error?: string | null;
  disabled?: boolean;
  loading?: boolean;
  /** `minimal`: avatar + buttons. `enhanced`: large preview, drag-and-drop zone and helper text. `cover`: a wide preview with choose, take and remove, for an editor that holds only the picture. */
  variant?: PhotoPickerVariant;
  /** Minimal variant only: set false when the caller already renders its own preview bound to the same `photoUrl`. */
  showPreview?: boolean;
  /** Adds "Take a photo" on a touch screen, for a photo of something usually in front of the person (a plate, a pet); never for one they already have (a cover, a profile picture). */
  canTakePhoto?: boolean;
  uploadLabel?: string;
  changeLabel?: string;
  /** Cover variant only: shown in the preview while there is no photo, or when it can't load. */
  placeholder?: ReactNode;
  /** Cover variant only: what can be chosen, as a line under the buttons. */
  note?: string;
  /** Cover variant only: a shorter preview, hidden on a short screen, for an editor that has more under it (suggestions to pick from). */
  isCompact?: boolean;
  onSelect: (file: File | null) => void;
  /** Without it there is no Remove button, for a photo that is required. */
  onRemove?: () => void;
}

function PhotoPicker({
  photoUrl,
  fallbackUrl = null,
  initials,
  error,
  disabled = false,
  loading = false,
  variant = 'minimal',
  showPreview = true,
  canTakePhoto = false,
  uploadLabel = 'Upload photo',
  changeLabel = 'Change photo',
  placeholder = null,
  note,
  isCompact = false,
  onSelect,
  onRemove,
}: PhotoPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isTouch = useCanTakePhoto();
  const isCameraShown = canTakePhoto && isTouch;
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

  const errorText = error && <p className='text-sm text-red-500'>{error}</p>;

  const openPicker = (isCamera: boolean) =>
    openFileChooser(inputRef.current, { isCamera });

  if (variant === 'cover') {
    return (
      <div className='space-y-3'>
        {fileInput}
        <div
          className={join(
            'bg-accent text-accent-foreground relative grid aspect-video w-full place-items-center overflow-hidden rounded-2xl text-6xl',
            isCompact
              ? 'max-h-36 [@media(max-height:600px)]:hidden [@media(max-height:700px)]:max-h-24'
              : 'max-h-44 [@media(max-height:600px)]:max-h-20',
          )}
          aria-hidden='true'
        >
          {photoUrl ? (
            <FallbackImage
              src={photoUrl}
              alt=''
              fallback={placeholder}
              className='absolute inset-0 size-full object-cover object-center'
            />
          ) : (
            placeholder
          )}
        </div>
        <div className={join('grid gap-2', isCameraShown && 'grid-cols-2')}>
          <Button
            type='button'
            variant='secondary'
            className='h-11 gap-1.5 px-2.5 whitespace-nowrap'
            disabled={isBusy}
            onClick={() => openPicker(false)}
          >
            <ImagePlus
              className='h-4 w-4 shrink-0 max-[380px]:hidden'
              aria-hidden='true'
            />
            {photoUrl ? changeLabel : uploadLabel}
          </Button>
          {isCameraShown && (
            <Button
              type='button'
              variant='secondary'
              className='h-11 gap-1.5 px-2.5 whitespace-nowrap'
              disabled={isBusy}
              onClick={() => openPicker(true)}
            >
              <Camera
                className='h-4 w-4 shrink-0 max-[380px]:hidden'
                aria-hidden='true'
              />
              Take a photo
            </Button>
          )}
        </div>
        {photoUrl && onRemove && (
          <ActionChips
            actions={[
              {
                key: 'remove',
                icon: <Trash2 className='h-4 w-4' aria-hidden='true' />,
                label: 'Remove photo',
                isDestructive: true,
                isDisabled: isBusy,
                onClick: onRemove,
              },
            ]}
          />
        )}
        {note && <p className='text-muted-foreground text-xs'>{note}</p>}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
      </div>
    );
  }

  const buttons = (
    <div className='flex flex-wrap items-center justify-center gap-2'>
      {isCameraShown && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className="relative gap-1.5 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          disabled={isBusy}
          onClick={() => openPicker(true)}
        >
          <Camera className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
          Take a photo
        </Button>
      )}
      <Button
        type='button'
        variant='secondary'
        size='sm'
        className="relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
        disabled={isBusy}
        onClick={() => openPicker(false)}
      >
        {photoUrl ? changeLabel : uploadLabel}
      </Button>
      {photoUrl && onRemove && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="border-destructive/40 hover:bg-destructive/10 text-destructive! relative border before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          disabled={isBusy}
          onClick={onRemove}
        >
          Remove
        </Button>
      )}
    </div>
  );

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
            : 'Drag a photo here, or browse. Any photo from your phone works.'}
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
