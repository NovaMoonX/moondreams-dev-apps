import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { LoaderCircle, Volume2, X } from 'lucide-react';

interface CookPepperAnswerProps {
  /** What the person asked, as it was heard. */
  heard: string;
  /** The answer so far; it grows while Pepper is still saying it. */
  text: string;
  /** Pepper is looking it up on the web and has nothing to show yet. */
  isSearching: boolean;
  onReadAloud: () => void;
  onDismiss: () => void;
}

const ICON_BUTTON =
  'text-foreground! relative size-9 min-w-9 shrink-0 rounded-full px-0! py-0! before:absolute before:-inset-0.5 before:content-[""] sm:[@media(min-height:701px)]:size-10 sm:[@media(min-height:701px)]:min-w-10';

/** Pepper's answer, kept on the step after it is spoken so the person can read it back: the question it answers, the words as they arrive, a speaker and a ✕. */
function CookPepperAnswer({
  heard,
  text,
  isSearching,
  onReadAloud,
  onDismiss,
}: CookPepperAnswerProps) {
  const cardRef = useRef<HTMLElement>(null);
  const isWaiting = text.trim() === '';
  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isWaiting]);

  return (
    <section
      ref={cardRef}
      aria-label='Pepper’s answer'
      data-no-swipe=''
      className='border-border bg-accent scroll-mb-40 rounded-2xl border p-3 sm:[@media(min-height:701px)]:p-4'
    >
      <div className='flex items-start gap-2'>
        <p className='text-muted-foreground min-w-0 flex-1 pt-1.5 text-xs font-medium sm:[@media(min-height:701px)]:text-sm'>
          <span className='line-clamp-2 wrap-break-word'>
            You asked “{heard}”
          </span>
        </p>
        {!isWaiting && (
          <Button
            type='button'
            variant='tertiary'
            aria-label='Read the answer aloud'
            className={ICON_BUTTON}
            onClick={onReadAloud}
          >
            <Volume2 className='h-4 w-4' aria-hidden='true' />
          </Button>
        )}
        <Button
          type='button'
          variant='tertiary'
          aria-label='Dismiss the answer'
          className={ICON_BUTTON}
          onClick={onDismiss}
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </Button>
      </div>
      {isWaiting ? (
        <p className='text-muted-foreground mt-1 flex items-center gap-2 text-base'>
          <LoaderCircle
            className='h-4 w-4 shrink-0 motion-safe:animate-spin'
            aria-hidden='true'
          />
          {isSearching ? 'Looking it up…' : 'Thinking…'}
        </p>
      ) : (
        <p
          className={join(
            'text-foreground mt-1 max-h-48 overflow-y-auto text-base leading-relaxed wrap-break-word whitespace-pre-line',
            'lg:text-lg [@media(max-height:700px)]:max-h-32 sm:[@media(min-height:701px)]:max-h-64',
          )}
        >
          {text}
        </p>
      )}
    </section>
  );
}

export default CookPepperAnswer;
