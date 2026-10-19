import type { ReactNode } from 'react';

import { Button, Skeleton } from '@moondreamsdev/dreamer-ui/components';

export function SharedSkeleton() {
  return (
    <div
      className='space-y-5'
      aria-busy='true'
      aria-label='Opening the shared link'
    >
      <div className='flex items-center justify-between'>
        <Skeleton className='size-9' />
        <Skeleton className='h-4 w-24' />
      </div>
      <div className='grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 sm:grid-cols-1'>
        <Skeleton className='size-24 sm:h-56 sm:w-full' />
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
  action?: ReactNode;
}

function Message({ emoji, title, children, action }: MessageProps) {
  return (
    <div className='mx-auto max-w-sm space-y-3 py-16 text-center'>
      <span
        aria-hidden='true'
        className='bg-accent text-accent-foreground mx-auto grid size-16 place-items-center rounded-full text-3xl'
      >
        {emoji}
      </span>
      <h1 className='text-xl font-semibold'>{title}</h1>
      <p className='text-muted-foreground text-sm text-pretty'>{children}</p>
      {action}
    </div>
  );
}

/** One answer for a link that was stopped, never existed or was mistyped, so nothing says which. */
export function SharedNotFound() {
  return (
    <Message emoji='🫙' title="This link isn't available">
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
      action={
        <Button type='button' className='h-12 px-6' onClick={onRetry}>
          Try again
        </Button>
      }
    >
      Check your connection and give it another try.
    </Message>
  );
}
