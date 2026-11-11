import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Loader2, X } from 'lucide-react';

import FallbackImage from '@/components/FallbackImage';
import { HELM_COPY } from '@apps/helm/constants';
import type { TurnAttachment } from '@apps/helm/hooks/useMediaUpload';

interface AttachmentChipsProps {
  items: TurnAttachment[];
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

/** The photos picked for the turn being written, above the field: a spinner while one uploads, then Remove photo; a failed one says so with Try again. */
function AttachmentChips({ items, onRemove, onRetry }: AttachmentChipsProps) {
  if (items.length === 0) return null;
  return (
    <ul className='flex flex-wrap gap-2'>
      {items.map((item, index) => (
        <li key={item.key} className='flex w-16 flex-col items-start gap-0.5'>
          <span className='bg-muted relative block size-16 overflow-hidden rounded-xl'>
            <FallbackImage
              src={item.previewUrl}
              alt={HELM_COPY.attachThumbLabel(index + 1)}
              fallback={null}
              className={join(
                'size-full object-cover',
                item.status === 'failed' && 'opacity-40',
              )}
            />
            {item.status === 'uploading' && (
              <span
                className='bg-background/50 absolute inset-0 grid place-items-center'
                role='status'
                aria-label={HELM_COPY.attachUploading}
              >
                <Loader2 className='size-5 animate-spin' aria-hidden='true' />
              </span>
            )}
            {item.status !== 'uploading' && (
              <Button
                type='button'
                variant='base'
                size='icon'
                aria-label={HELM_COPY.attachRemove}
                className="bg-background/85 text-foreground absolute top-1 right-1 size-6 min-w-6 rounded-full p-0 before:absolute before:-inset-2 before:content-['']"
                onClick={() => onRemove(item.key)}
              >
                <X className='size-3.5' aria-hidden='true' />
              </Button>
            )}
          </span>
          {item.status === 'failed' && (
            <>
              <span className='text-destructive text-[12px] leading-4'>
                {HELM_COPY.attachFailed}
              </span>
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className="relative h-auto min-w-0 p-0! text-[12px] before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
                onClick={() => onRetry(item.key)}
              >
                {HELM_COPY.attachTryAgain}
              </Button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default AttachmentChips;
