import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { ReactNode } from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowUp, Mic, Square } from 'lucide-react';

import AssistantOrb from '@/components/AssistantOrb';
import type { AssistantOrbState } from '@/components/AssistantOrb';
import DebugDetails from '@/components/DebugDetails';
import MicrophoneAccess from '@/components/MicrophoneAccess';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { useVoiceConversation } from '@/hooks/useVoiceConversation';
import { getAiReadFailureMessage } from '@/lib/firebase/aiFailure';
import type { VoiceIdentity } from '@/lib/speech/voice/types';
import PepperFace from '@apps/pinch/components/cooking/PepperFace';
import {
  MAX_PEPPER_ASK_LENGTH,
  MAX_PEPPER_ROUNDS,
} from '@apps/pinch/constants';
import type { PepperLook } from '@apps/pinch/types';

const ASK_MAX_LINES = 5;
const SHORT_SCREEN_ASK_LINES = 3;
const ROUND_BUTTON =
  "relative size-9 shrink-0 before:absolute before:-inset-0.5 before:content-['']";

const VOICE_IDENTITY: VoiceIdentity = {
  id: 'pinch-pepper-edit',
  label: 'Pepper',
  device: { naturalVoice: false, systemVoiceHints: [], rate: 1, pitch: 1 },
};

interface PepperDockProps {
  /** Changes asked for so far in this sitting. */
  rounds: number;
  /** Focuses the box as the screen opens. */
  isStartFocused: boolean;
  /** The person's chosen look for Pepper, drawn while Pepper listens or works. */
  look: PepperLook;
  /** What Pepper last did and the change finder, shown above the box. */
  above?: ReactNode;
  /** Resolves once Pepper's answer is in the form; rejects when it could not be made. */
  onSend: (ask: string) => Promise<void>;
}

/** The chat-style box pinned at the foot of the recipe form, where a person types or says what to change; the answer lands in the form, never saved. */
function PepperDock({
  rounds,
  isStartFocused,
  look,
  above,
  onSend,
}: PepperDockProps) {
  const [text, setText] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [spokenAsk, setSpokenAsk] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    message: string;
    detail: string;
  } | null>(null);
  const [needsMicrophone, setNeedsMicrophone] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useGrowingTextarea(
    fieldRef,
    text,
    window.innerHeight < 600 ? SHORT_SCREEN_ASK_LINES : ASK_MAX_LINES,
  );

  useEffect(() => {
    const field = fieldRef.current;
    if (!isStartFocused || field === null) return;
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
  }, [isStartFocused]);
  const lang = useMemo(() => navigator.language || 'en-US', []);

  const send = async (ask: string, isSpoken: boolean) => {
    if (ask === '' || isWorking) return;
    setFailure(null);
    setIsWorking(true);
    setSpokenAsk(isSpoken ? ask : null);
    try {
      await onSend(ask);
      if (!isSpoken) setText('');
      fieldRef.current?.blur();
    } catch (sendError) {
      if (isSpoken) setText(ask);
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
      setSpokenAsk(null);
    }
  };

  const voice = useVoiceConversation({
    lang,
    identity: VOICE_IDENTITY,
    endPhrases: [],
    cloudListening: null,
    onUtterance: (spoken) => {
      voice.settle();
      const ask = `${text.trim()} ${spoken}`
        .trim()
        .slice(0, MAX_PEPPER_ASK_LENGTH);
      void send(ask, true);
    },
    onUnavailable: (reason) => setNeedsMicrophone(reason === 'no-permission'),
  });
  const isListening = voice.state === 'listening' || voice.isStarting;
  const canListen = voice.unavailableReason !== 'no-recognition';
  const isVoiceShown = isListening || spokenAsk !== null;

  if (rounds >= MAX_PEPPER_ROUNDS) {
    return (
      <div className='mb-3 space-y-2'>
        {above}
        <p className='text-muted-foreground text-xs'>
          That&apos;s as many changes as one sitting takes. Save, then ask
          again.
        </p>
      </div>
    );
  }

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
    void send(text.trim(), false);
  };

  const getOrbState = (): AssistantOrbState =>
    spokenAsk !== null ? 'thinking' : 'listening';

  const getHeard = () => {
    if (spokenAsk !== null) return spokenAsk;
    const heard = `${text.trim()} ${voice.heard.trim()}`.trim();
    return heard === '' ? 'Say what to change.' : heard;
  };

  return (
    <div className='mb-3 space-y-2'>
      {above}
      {isVoiceShown ? (
        <div className='border-border bg-background flex items-center gap-3 rounded-3xl border p-2 pl-3'>
          <AssistantOrb
            state={getOrbState()}
            word={spokenAsk !== null ? 'Changing it…' : 'Listening'}
            reserveWord='Changing it…'
            placement='header'
            avatar={look === 'ORB' ? undefined : <PepperFace look={look} />}
            name='Pepper'
            className='shrink-0'
          />
          <p
            className={join(
              'line-clamp-3 min-w-0 flex-1 text-sm',
              voice.heard.trim() === '' &&
                text.trim() === '' &&
                spokenAsk === null &&
                'text-muted-foreground',
            )}
            aria-live='polite'
          >
            {getHeard()}
          </p>
          {spokenAsk === null && (
            <Button
              type='button'
              variant='secondary'
              size='icon'
              rounded='full'
              className={ROUND_BUTTON}
              aria-label='Stop listening'
              onClick={() => voice.stop()}
            >
              <Square className='h-3.5 w-3.5 fill-current' aria-hidden='true' />
            </Button>
          )}
        </div>
      ) : (
        <div className='border-border bg-background focus-within:border-foreground/40 flex items-end gap-1.5 rounded-3xl border p-1.5 pl-3'>
          <Textarea
            ref={fieldRef}
            rows={1}
            variant='base'
            aria-label='What to change'
            placeholder='Ask Pepper'
            maxLength={MAX_PEPPER_ASK_LENGTH}
            value={text}
            disabled={isWorking}
            className='min-h-9 flex-1 resize-none bg-transparent px-0 py-2 text-sm placeholder:truncate focus:outline-none'
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {canListen && text.trim() === '' && (
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              className={ROUND_BUTTON}
              aria-label='Say what to change'
              disabled={isWorking}
              onClick={() => voice.listen()}
            >
              <Mic className='h-4 w-4' aria-hidden='true' />
            </Button>
          )}
          <Button
            type='button'
            size='icon'
            rounded='full'
            className={ROUND_BUTTON}
            aria-label='Send to Pepper'
            loading={isWorking}
            disabled={isWorking || text.trim() === ''}
            onClick={() => void send(text.trim(), false)}
          >
            <ArrowUp className='h-4 w-4' aria-hidden='true' />
          </Button>
        </div>
      )}
      {needsMicrophone && (
        <MicrophoneAccess onAllowed={() => setNeedsMicrophone(false)} />
      )}
      {failure !== null && (
        <div className='space-y-1.5'>
          <p className='text-destructive line-clamp-2 text-sm' role='alert'>
            {failure.message}
          </p>
          <DebugDetails message={failure.detail} />
        </div>
      )}
      {rounds === 0 && failure === null && !isVoiceShown && (
        <p className='text-muted-foreground px-3 text-xs'>
          Your recipe and request go to Gemini, and speech to your browser.
          Nothing is saved until you press Save.
        </p>
      )}
    </div>
  );
}

export default PepperDock;
