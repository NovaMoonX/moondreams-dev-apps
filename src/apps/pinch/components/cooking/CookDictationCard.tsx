import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, Mic } from 'lucide-react';

interface CookDictationCardProps {
  /** "tip", "note" or "change". */
  word: string;
  stepNumber: number;
  /** Waiting for the words, or the words are written down. */
  phase: 'WAITING' | 'SAVED';
  /** The words picked up so far; empty until some are heard. */
  heard: string;
  /** The recognizer is open: the person can start saying it. */
  isListening: boolean;
  /** What was written down, once it was. */
  savedText: string;
  onCancel: () => void;
  onUndo: () => void;
}

/** What a voice-written tip, note or change is doing, on the step: waiting for the words (with the ones heard so far, as they come in) and, once written, what was saved with an Undo. */
function CookDictationCard({
  word,
  stepNumber,
  phase,
  heard,
  isListening,
  savedText,
  onCancel,
  onUndo,
}: CookDictationCardProps) {
  const isWaiting = phase === 'WAITING';
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: 'nearest' });
  }, [phase, heard]);

  return (
    <div
      ref={cardRef}
      role='status'
      aria-live='polite'
      className='border-border bg-accent flex scroll-mb-40 items-start gap-3 rounded-2xl border p-3'
    >
      <span
        aria-hidden='true'
        className='bg-background text-primary mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full'
      >
        {isWaiting ? (
          <Mic
            className={join(
              'h-4 w-4',
              isListening && 'motion-safe:animate-pulse',
            )}
          />
        ) : (
          <Check className='h-4 w-4' />
        )}
      </span>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium'>
          {isWaiting
            ? `Say your ${word}`
            : `Saved as a ${word} for step ${stepNumber}`}
        </p>
        <p
          className={join(
            'mt-0.5 line-clamp-3 text-sm wrap-break-word [@media(max-height:700px)]:line-clamp-2',
            heard === '' && isWaiting
              ? 'text-muted-foreground'
              : 'text-foreground',
          )}
        >
          {isWaiting
            ? heard !== ''
              ? `“${heard}”`
              : isListening
                ? 'Listening…'
                : 'Getting ready…'
            : `“${savedText}”`}
        </p>
      </div>
      <Button
        variant='secondary'
        size='sm'
        className='border-border relative shrink-0 border before:absolute before:-inset-[6px] before:content-[""]'
        onClick={isWaiting ? onCancel : onUndo}
      >
        {isWaiting ? 'Cancel' : 'Undo'}
      </Button>
    </div>
  );
}

export default CookDictationCard;
