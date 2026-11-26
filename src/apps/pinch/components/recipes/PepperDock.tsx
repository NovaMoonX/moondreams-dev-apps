import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { ReactNode } from 'react';

import { httpsCallable } from 'firebase/functions';

import AssistantOrb from '@/components/AssistantOrb';
import DebugDetails from '@/components/DebugDetails';
import DictationField from '@/components/DictationField';
import MicrophoneAccess from '@/components/MicrophoneAccess';
import { appendDictated, useDictation } from '@/hooks/useDictation';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { getAiReadFailureMessage } from '@/lib/firebase/aiFailure';
import { buildNameHints } from '@/lib/speech/nameHints';
import type { VoiceIdentity } from '@/lib/speech/voice/types';
import {
  createVoiceTokenSource,
  type MintVoiceTokenRequest,
  type MintVoiceTokenResult,
} from '@/lib/speech/voice/voiceToken';
import { functions } from '@lib/firebase/config';
import PepperFace from '@apps/pinch/components/cooking/PepperFace';
import {
  MAX_PEPPER_ASK_LENGTH,
  MAX_PEPPER_ROUNDS,
} from '@apps/pinch/constants';
import type { PepperLook } from '@apps/pinch/types';

const ASK_MAX_LINES = 5;
const SHORT_SCREEN_ASK_LINES = 3;

const VOICE_IDENTITY: VoiceIdentity = {
  id: 'pinch-pepper-edit',
  label: 'Pepper',
  device: { naturalVoice: false, systemVoiceHints: [], rate: 1, pitch: 1 },
};

const DICTATION_COPY = {
  micLabel: 'Say what to change',
  stopLabel: 'Stop listening',
  sendLabel: 'Send to Pepper',
  listening: 'Listening',
  formatting: 'Writing it down…',
  nothingHeard: "Didn't catch that. Tap the mic to try again, or type it.",
  listenFailed: "Couldn't listen just now. Type it instead.",
};

const mintVoiceToken = httpsCallable<
  MintVoiceTokenRequest,
  MintVoiceTokenResult
>(functions, 'mintVoiceToken');

interface PepperDockProps {
  /** Changes asked for so far in this sitting. */
  rounds: number;
  /** Focuses the box as the screen opens. */
  isStartFocused: boolean;
  /** The person's chosen look for Pepper, drawn while Pepper listens or works. */
  look: PepperLook;
  /** What Pepper last did and the change finder, shown above the box. */
  above?: ReactNode;
  /** Names in the recipe (its title, its ingredients) the speech listener is told to expect. */
  nameHints?: string[];
  /** Resolves once Pepper's answer is in the form; rejects when it could not be made. */
  onSend: (ask: string) => Promise<void>;
}

/** The chat-style box pinned at the foot of the recipe form, where a person types or says what to change; spoken words land in the box to read and send, and the answer lands in the form, never saved. */
function PepperDock({
  rounds,
  isStartFocused,
  look,
  above,
  nameHints,
  onSend,
}: PepperDockProps) {
  const [text, setText] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [failure, setFailure] = useState<{
    message: string;
    detail: string;
  } | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [tokenSource] = useState(() =>
    createVoiceTokenSource({
      appId: 'pinch',
      mint: async (request) => (await mintVoiceToken(request)).data,
    }),
  );
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

  const send = async (ask: string) => {
    if (ask === '' || isWorking) return;
    setFailure(null);
    setIsWorking(true);
    try {
      await onSend(ask);
      setText('');
      fieldRef.current?.blur();
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

  const dictation = useDictation({
    lang,
    identity: VOICE_IDENTITY,
    cloudListening: { tokenSource, isAllowed: true },
    getNameHints:
      nameHints === undefined
        ? undefined
        : () =>
            buildNameHints(
              nameHints.map((hint, index) => ({
                text: hint,
                rank: 0,
                weight: nameHints.length - index,
              })),
            ),
    onWords: (spoken) =>
      setText((typed) => appendDictated(typed, spoken, MAX_PEPPER_ASK_LENGTH)),
  });
  const isVoiceShown = dictation.phase !== 'idle';

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
    void send(text.trim());
  };

  return (
    <div className='mb-3 space-y-2'>
      {above}
      <DictationField
        dictation={dictation}
        value={text}
        onChange={setText}
        onSend={() => void send(text.trim())}
        onKeyDown={handleKeyDown}
        fieldRef={fieldRef}
        placeholder='Ask Pepper'
        ariaLabel='What to change'
        maxLength={MAX_PEPPER_ASK_LENGTH}
        isBusy={isWorking}
        copy={DICTATION_COPY}
        leading={
          <AssistantOrb
            state={dictation.phase === 'listening' ? 'listening' : 'waiting'}
            word={dictation.phase === 'listening' ? 'Listening' : 'Writing'}
            reserveWord='Listening'
            placement='header'
            getLevel={() => dictation.getLevel() ?? 0}
            avatar={look === 'ORB' ? undefined : <PepperFace look={look} />}
            name='Pepper'
            className='shrink-0'
          />
        }
      />
      {dictation.needsMicrophone && (
        <MicrophoneAccess onAllowed={dictation.clearNeedsMicrophone} />
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
          Your recipe and request go to Claude, which may search the web to find
          a link. Nothing is saved until you press Save.
          {dictation.canListen &&
            " What you say goes to Deepgram to be turned into words, or to your browser's own listening when that's slow. Deepgram doesn't keep the sound or use it to train its models."}
        </p>
      )}
    </div>
  );
}

export default PepperDock;
