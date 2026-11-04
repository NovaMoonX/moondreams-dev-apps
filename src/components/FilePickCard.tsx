import { useState, type DragEvent, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera, Upload } from 'lucide-react';

import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { formatFileSize } from '@/utils/fileUtils';

export interface PickedFile {
  name: string;
  size: number;
  emoji: string;
}

interface FilePickCardProps {
  /** The slot's one action, in the person's words ("Tap to choose a file"). */
  title: string;
  /** What can be chosen, in the person's words ("Photo, screenshot or PDF"). */
  accepts: string;
  /** The size limit, joined to what can be chosen on one line ("up to 10 MB"). */
  limit: string;
  picked: PickedFile | null;
  /** A line under the slot or the picked file: a tip, what is happening to it, or why it failed. */
  status: ReactNode;
  isDisabled?: boolean;
  /** On a phone the empty slot grows into the height its section has left. */
  isFilling?: boolean;
  /** Opens the file picker; the card is a target for it as well as a place to drop onto. */
  onPick: () => void;
  /** Adds "Take a photo" under the empty slot on a touch screen, for something usually in front of the person (a receipt, a cookbook page); the caller opens its input with `openFileChooser(input, { isCamera: true })`. */
  onTakePhoto?: () => void;
  onDropFile: (file: File) => void;
}

/** A place to choose or drop one file: an empty slot that says what it takes, then the file with its size once there is one. */
function FilePickCard({
  title,
  accepts,
  limit,
  picked,
  status,
  isDisabled = false,
  isFilling = false,
  onPick,
  onTakePhoto,
  onDropFile,
}: FilePickCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const isTouch = useCanTakePhoto();
  const isCameraShown = isTouch && onTakePhoto !== undefined && !picked;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !isDisabled) {
      onDropFile(file);
    }
  };

  return (
    <div
      className={join(
        'rounded-2xl border',
        isFilling && 'max-sm:flex max-sm:flex-1 max-sm:flex-col',
        isDragging
          ? 'bg-accent/40 border-primary'
          : join('border-border', picked ? 'bg-card' : 'border-dashed'),
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isDisabled) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      {picked ? (
        <div className='flex items-start gap-3 p-3'>
          <span
            className='bg-accent grid size-10 shrink-0 place-items-center rounded-xl text-xl leading-none'
            aria-hidden='true'
          >
            {picked.emoji}
          </span>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium'>{picked.name}</p>
            <p className='text-muted-foreground text-xs'>
              {formatFileSize(picked.size)}
            </p>
          </div>
        </div>
      ) : (
        <Button
          type='button'
          variant='tertiary'
          disabled={isDisabled}
          onClick={onPick}
          className={join(
            'h-auto min-h-40 w-full flex-col gap-2 rounded-2xl px-4! py-6 text-center font-normal whitespace-normal',
            isFilling && 'max-sm:flex-1',
          )}
        >
          <span
            className='bg-accent text-foreground grid size-12 place-items-center rounded-xl'
            aria-hidden='true'
          >
            <Upload className='h-6 w-6' />
          </span>
          <span className='text-foreground text-sm font-medium'>{title}</span>
          <span className='text-muted-foreground text-xs'>
            {accepts} · {limit}
            <span className='max-sm:hidden'> · or drop it here</span>
          </span>
        </Button>
      )}
      {isCameraShown && (
        <div className='px-3 pb-3'>
          <Button
            type='button'
            variant='tertiary'
            disabled={isDisabled}
            onClick={onTakePhoto}
            className='border-border h-11 w-full gap-2 border'
          >
            <Camera className='h-4 w-4 shrink-0' aria-hidden='true' />
            Take a photo
          </Button>
        </div>
      )}
      <div className='border-border border-t px-4 py-2.5'>{status}</div>
    </div>
  );
}

export default FilePickCard;
