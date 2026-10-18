import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { Avatar, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import FallbackImage from '@/components/FallbackImage';

export type PhotoPickerVariant = 'minimal' | 'enhanced' | 'cover';

const TOUCH_QUERY = '(pointer: coarse)';

const subscribeToPointer = (onChange: () => void) => {
  const query = window.matchMedia(TOUCH_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const getIsTouch = () => window.matchMedia(TOUCH_QUERY).matches;

interface PhotoPickerProps {
  photoUrl: string | null;
  fallbackUrl?: string | null;
  initials?: string;
  error?: string | null;
  disabled?: boolean;
  loading?: boolean;
  /** `minimal`: avatar + buttons. `enhanced`: large preview, drag-and-drop zone and helper text. `cover`: a wide preview with choose, take (touch screens only) and remove, for an editor that holds only the picture. */
  variant?: PhotoPickerVariant;
  /** Minimal variant only: set false when the caller already renders its own preview bound to the same `photoUrl`. */
  showPreview?: boolean;
  uploadLabel?: string;
  changeLabel?: string;
  /** Cover variant only: shown in the preview while there is no photo, or when it can't load. */
  placeholder?: ReactNode;
  /** Cover variant only: what can be chosen, as a line under the buttons. */
  note?: string;
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
  uploadLabel = 'Upload photo',
  changeLabel = 'Change photo',
  placeholder = null,
  note,
  onSelect,
  onRemove,
}: PhotoPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isTouch = useSyncExternalStore(
    subscribeToPointer,
    getIsTouch,
    () => false,
  );
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

  const openPicker = (shouldCapture: boolean) => {
    const input = inputRef.current;
    if (!input) return;
    if (shouldCapture) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  };

  if (variant === 'cover') {
    return (
      <div className='space-y-3'>
        {fileInput}
        <div
          className='bg-accent text-accent-foreground grid aspect-video max-h-44 w-full place-items-center overflow-hidden rounded-2xl text-6xl [@media(max-height:600px)]:max-h-20'
          aria-hidden='true'
        >
          {photoUrl ? (
            <FallbackImage
              src={photoUrl}
              alt=''
              fallback={placeholder}
              className='size-full object-cover'
            />
          ) : (
            placeholder
          )}
        </div>
        <div className={join('grid gap-2', isTouch && 'grid-cols-2')}>
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
          {isTouch && (
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
    <div className='flex items-center gap-2'>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        className="relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
        disabled={isBusy}
        onClick={() => inputRef.current?.click()}
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
