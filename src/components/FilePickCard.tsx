import { useState, type DragEvent, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { formatFileSize } from '@/utils/fileUtils';

export interface PickedFile {
  name: string;
  size: number;
  emoji: string;
}

interface FilePickCardProps {
  /** What can be chosen, in the person's words ("A photo, screenshot or PDF"). */
  accepts: string;
  limit: string;
  emoji: string;
  picked: PickedFile | null;
  /** A line under the slot or the picked file: a tip, what is happening to it, or why it failed. */
  status: ReactNode;
  isDisabled?: boolean;
  /** Opens the file picker; the card is a target for it as well as a place to drop onto. */
  onPick: () => void;
  onDropFile: (file: File) => void;
}

/** A place to choose or drop one file: an empty slot that says what it takes, then the file with its size once there is one. */
function FilePickCard({
  accepts,
  limit,
  emoji,
  picked,
  status,
  isDisabled = false,
  onPick,
  onDropFile,
}: FilePickCardProps) {
  const [isDragging, setIsDragging] = useState(false);

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
          className='h-auto min-h-40 w-full flex-col gap-2 rounded-2xl px-4! py-6 text-center font-normal whitespace-normal'
        >
          <span
            className='bg-accent grid size-12 place-items-center rounded-xl text-2xl leading-none'
            aria-hidden='true'
          >
            {emoji}
          </span>
          <span className='text-foreground text-sm font-medium'>{accepts}</span>
          <span className='text-muted-foreground text-xs'>
            {limit}
            <span className='max-sm:hidden'> · or drop it here</span>
          </span>
        </Button>
      )}
      <div className='border-border border-t px-4 py-2.5'>{status}</div>
    </div>
  );
}

export default FilePickCard;
