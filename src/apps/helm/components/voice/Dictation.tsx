import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Mic } from 'lucide-react';

import { VoiceNotice } from '@apps/helm/components/voice/VoiceStatus';
import { HELM_COPY } from '@apps/helm/constants';
import {
  useHelmVoiceContext,
  useIsDictatingHere,
} from '@apps/helm/hooks/useHelmVoice';

// Two lines of the 13px line under the field.
const CLIP_HEIGHT = 40;

/** The mic that puts spoken words into a field: a tap starts, a second keeps what was heard. */
export function DictateButton({
  owner,
  label,
  onWords,
  isDisabled = false,
  className,
}: {
  owner: string;
  label: string;
  onWords: (words: string) => void;
  isDisabled?: boolean;
  className?: string;
}) {
  const voice = useHelmVoiceContext();
  const isHere = useIsDictatingHere(owner);
  return (
    <Button
      type='button'
      variant='tertiary'
      size='icon'
      rounded='full'
      aria-label={isHere ? HELM_COPY.dictateDone : label}
      aria-pressed={isHere}
      disabled={isDisabled}
      className={join(
        'relative size-10 min-h-0 min-w-10 shrink-0 p-0',
        isHere &&
          "bg-primary/15! ring-primary/80 before:ring-primary/50 ring-2 before:absolute before:-inset-1 before:rounded-full before:ring-2 before:content-[''] motion-safe:before:animate-pulse",
        className,
      )}
      onClick={() => voice.dictate(onWords, owner)}
    >
      <Mic
        className={join('size-5', isHere && 'text-primary')}
        aria-hidden='true'
      />
    </Button>
  );
}

/** What is being heard for a field, with Cancel and where the speech goes; nothing unless that field is listening. */
export function DictationLine({ owner }: { owner: string }) {
  return useIsDictatingHere(owner) ? <HeardLine /> : null;
}

function HeardLine() {
  const voice = useHelmVoiceContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClipped, setIsClipped] = useState(false);
  const text = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const element = text.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setIsClipped(entry.contentRect.height > CLIP_HEIGHT),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className='flex w-full flex-col items-start gap-0.5'
      role='status'
      aria-live='polite'
    >
      <div className='flex w-full items-start gap-2'>
        <div className='flex min-w-0 flex-1 flex-col items-start py-1'>
          <div
            className={join(
              'flex w-full flex-col justify-end overflow-hidden',
              !isExpanded && 'max-h-10',
            )}
          >
            <p
              ref={text}
              className='text-muted-foreground text-left text-[13px] leading-5 break-words'
            >
              {voice.heard ||
                (voice.isPreparing
                  ? HELM_COPY.talkGettingReady
                  : HELM_COPY.talkListeningHint)}
            </p>
          </div>
          {(isClipped || isExpanded) && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className="text-primary relative -ml-2 h-7 text-[13px] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
              onClick={() => setIsExpanded((was) => !was)}
            >
              {isExpanded
                ? HELM_COPY.dictationShowLess
                : HELM_COPY.dictationShowAll}
            </Button>
          )}
        </div>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="relative -mr-1 shrink-0 text-[13px] before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
          onClick={voice.cancel}
        >
          {HELM_COPY.talkCancel}
        </Button>
      </div>
      {voice.listeningRoute === 'cloud' && (
        <div className='-ml-3'>
          <VoiceNotice />
        </div>
      )}
    </div>
  );
}
