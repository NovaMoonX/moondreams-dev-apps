import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { ArrowUp, LoaderCircle, Mic, Sparkles, Square } from 'lucide-react';

import DebugDetails from '@/components/DebugDetails';
import MicrophoneAccess from '@/components/MicrophoneAccess';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { useVoiceConversation } from '@/hooks/useVoiceConversation';
import { getAiReadFailureMessage } from '@/lib/firebase/aiFailure';
import type { VoiceIdentity } from '@/lib/speech/voice/types';
import {
  MAX_PEPPER_ASK_LENGTH,
  MAX_PEPPER_ROUNDS,
} from '@apps/pinch/constants';

const ASK_MAX_LINES = 4;

const VOICE_IDENTITY: VoiceIdentity = {
  id: 'pinch-pepper-edit',
  label: 'Pepper',
  device: { naturalVoice: false, systemVoiceHints: [], rate: 1, pitch: 1 },
};

interface PepperComposerProps {
  /** Changes asked for so far in this sitting. */
  rounds: number;
  /** Starts with the box open and focused, instead of the one start line. */
  isStartOpen: boolean;
  /** Resolves once Pepper's answer is in the form; rejects when it could not be made. */
  onSend: (ask: string) => Promise<void>;
}

/** The box where a person types or says what to change in a recipe; the answer lands in the form, never saved. */
function PepperComposer({ rounds, isStartOpen, onSend }: PepperComposerProps) {
  const [isOpen, setIsOpen] = useState(isStartOpen);
  const [text, setText] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const [failure, setFailure] = useState<{
    message: string;
    detail: string;
  } | null>(null);
  const [needsMicrophone, setNeedsMicrophone] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useGrowingTextarea(fieldRef, text, ASK_MAX_LINES);

  useEffect(() => {
    const field = fieldRef.current;
    if (!isStartOpen || field === null) return;
    // The drawer that opened this screen hands focus back to its opener as it closes.
    const home = field.closest('[role="dialog"]') ?? document.body;
    const pullBack = (event: FocusEvent) => {
      if (event.target instanceof Node && !home.contains(event.target)) {
        field.focus();
      }
    };
    document.addEventListener('focusin', pullBack);
    field.focus();
    const timer = window.setTimeout(
      () => document.removeEventListener('focusin', pullBack),
      1500,
    );
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', pullBack);
    };
  }, [isStartOpen]);
  const lang = useMemo(() => navigator.language || 'en-US', []);

  const voice = useVoiceConversation({
    lang,
    identity: VOICE_IDENTITY,
    endPhrases: [],
    cloudListening: null,
    onUtterance: (spoken) => {
      setText((current) =>
        `${current.trim()} ${spoken}`.trim().slice(0, MAX_PEPPER_ASK_LENGTH),
      );
      voice.settle();
    },
    onUnavailable: (reason) => setNeedsMicrophone(reason === 'no-permission'),
  });
  const isListening = voice.state === 'listening';
  const canListen = voice.unavailableReason !== 'no-recognition';

  if (rounds >= MAX_PEPPER_ROUNDS) {
    return (
      <p className='text-muted-foreground mb-4 text-sm'>
        That&apos;s as many changes as one sitting takes. Save, then ask again.
      </p>
    );
  }

  const send = async () => {
    const ask = text.trim();
    if (ask === '' || isWorking) return;
    if (isListening) voice.cancel();
    setFailure(null);
    setIsWorking(true);
    try {
      await onSend(ask);
      setText('');
      setHasSent(true);
    } catch (sendError) {
      setFailure({
        message: getAiReadFailureMessage(sendError, {
          subject: 'recipe',
          fallback: 'change it by hand',
          unreadable:
            "Pepper couldn't make that change right now. Try saying it another way, or change it by hand.",
        }),
        detail:
          sendError instanceof Error ? sendError.message : String(sendError),
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      !window.matchMedia('(hover: hover)').matches
    ) {
      return;
    }
    event.preventDefault();
    void send();
  };

  if (!isOpen) {
    return (
      <Button
        type='button'
        variant='secondary'
        size='sm'
        rounded='full'
        className='mb-4 gap-1.5'
        onClick={() => setIsOpen(true)}
      >
        <Sparkles
          className='text-muted-foreground h-4 w-4'
          aria-hidden='true'
        />
        Tell Pepper what to change
      </Button>
    );
  }

  return (
    <div className='mb-4 space-y-2'>
      <p className='flex items-center gap-1.5 text-sm font-medium'>
        <Sparkles
          className='text-muted-foreground h-4 w-4 shrink-0'
          aria-hidden='true'
        />
        Tell Pepper what to change
      </p>
      {!hasSent && (
        <p className='text-muted-foreground text-xs'>
          Your recipe and what you ask are sent to Gemini to make the change.
          Nothing is saved until you press Save.
        </p>
      )}
      <Textarea
        ref={fieldRef}
        rows={2}
        variant='outline'
        aria-label='What to change'
        placeholder='Make it spicier, or swap the butter for olive oil'
        maxLength={MAX_PEPPER_ASK_LENGTH}
        value={text}
        disabled={isWorking}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {isListening && (
        <p className='text-muted-foreground text-xs' aria-live='polite'>
          {voice.heard.trim() === '' ? 'Listening…' : voice.heard}
        </p>
      )}
      {needsMicrophone && (
        <MicrophoneAccess onAllowed={() => setNeedsMicrophone(false)} />
      )}
      <div className='flex items-center gap-2'>
        <span className='min-w-0 flex-1'>
          {isWorking && (
            <span
              className='text-muted-foreground flex items-center gap-2 text-xs'
              role='status'
            >
              <LoaderCircle
                className='h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:[animation-duration:2.5s]'
                aria-hidden='true'
              />
              Pepper is changing the recipe…
            </span>
          )}
        </span>
        {canListen && (
          <Button
            type='button'
            variant='secondary'
            size='icon'
            rounded='full'
            className='size-10 shrink-0'
            aria-label={isListening ? 'Stop listening' : 'Say what to change'}
            aria-pressed={isListening}
            disabled={isWorking}
            onClick={() => {
              if (isListening) voice.stop();
              else voice.listen();
            }}
          >
            {isListening ? (
              <Square className='h-4 w-4 fill-current' aria-hidden='true' />
            ) : (
              <Mic className='h-4 w-4' aria-hidden='true' />
            )}
          </Button>
        )}
        <Button
          type='button'
          size='sm'
          rounded='full'
          className='shrink-0 gap-1.5'
          disabled={isWorking || text.trim() === ''}
          onClick={() => void send()}
        >
          <ArrowUp className='h-4 w-4' aria-hidden='true' />
          Send
        </Button>
      </div>
      {failure !== null && (
        <div className='space-y-1.5'>
          <p className='text-destructive text-sm' role='alert'>
            {failure.message}
          </p>
          <DebugDetails message={failure.detail} />
        </div>
      )}
    </div>
  );
}

export default PepperComposer;
