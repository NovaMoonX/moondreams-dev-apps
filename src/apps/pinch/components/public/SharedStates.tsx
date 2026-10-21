import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Skeleton } from '@moondreamsdev/dreamer-ui/components';

import SharedBrand from '@apps/pinch/components/public/SharedBrand';
import SlotCard from '@apps/pinch/components/public/SlotCard';

const PINCH_PATH = '/pinch';

export function SharedSkeleton() {
  return (
    <div
      className='mx-auto max-w-2xl space-y-4'
      aria-busy='true'
      aria-label='Opening the shared link'
    >
      <div className='flex items-center justify-between'>
        <Skeleton className='size-9' />
        <Skeleton className='h-4 w-24' />
      </div>
      <div className='grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 sm:grid-cols-1'>
        <Skeleton className='size-20 sm:h-56 sm:w-full' />
        <div className='space-y-2'>
          <Skeleton className='h-8 w-full' />
          <Skeleton className='h-4 w-40' />
        </div>
      </div>
      <Skeleton className='h-40 w-full' />
      <Skeleton className='h-6 w-28' />
      <Skeleton className='h-48 w-full' />
    </div>
  );
}

interface MessageProps {
  emoji: string;
  title: string;
  children: string;
  actions: ReactNode;
}

function Message({ emoji, title, children, actions }: MessageProps) {
  return (
    <div className='mx-auto max-w-md space-y-4'>
      <SharedBrand />
      <SlotCard emoji={emoji} lead={<h1>{title}</h1>} hint={children}>
        <div className='flex gap-2'>{actions}</div>
      </SlotCard>
    </div>
  );
}

interface OpenPinchButtonProps {
  variant: 'primary' | 'secondary';
}

function OpenPinchButton({ variant }: OpenPinchButtonProps) {
  const navigate = useNavigate();

  return (
    <Button
      type='button'
      variant={variant}
      className='h-11 min-w-0 flex-1'
      onClick={() => navigate(PINCH_PATH)}
    >
      Open Pinch
    </Button>
  );
}

/** One answer for a link that was stopped, never existed or was mistyped, so nothing says which. */
export function SharedNotFound() {
  return (
    <Message
      emoji='🫙'
      title="This link isn't available"
      actions={<OpenPinchButton variant='primary' />}
    >
      The person who shared it may have stopped sharing, or the address was
      mistyped.
    </Message>
  );
}

interface SharedFailedProps {
  onRetry: () => void;
}

/** The lookup itself failed; what the server said is never shown. */
export function SharedFailed({ onRetry }: SharedFailedProps) {
  return (
    <Message
      emoji='📡'
      title="We couldn't open this link"
      actions={
        <>
          <Button
            type='button'
            className='h-11 min-w-0 flex-1'
            onClick={onRetry}
          >
            Try again
          </Button>
          <OpenPinchButton variant='secondary' />
        </>
      }
    >
      Check your connection and give it another try.
    </Message>
  );
}
