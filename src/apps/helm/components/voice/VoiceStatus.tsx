import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowUp, Mic, Square, X } from 'lucide-react';

import MuteControl from '@apps/helm/components/voice/MuteControl';
import { HELM_COPY } from '@apps/helm/constants';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import type { ScreenContext } from '@apps/helm/types';

const BUTTON =
  "relative h-8 min-h-0 rounded-full px-3 before:absolute before:-inset-x-1 before:-inset-y-1 before:content-['']";

interface VoiceStatusProps {
  /** Draws its own Cancel, Send and Stop, for a place that has no Talk button (the conversation over a page). */
  hasControls?: boolean;
  /** Talking isn't possible here, so the person types: needed with `hasControls`. */
  onBlocked?: () => void;
  /** What a turn started here is asked about; null from home. */
  screen?: ScreenContext | null;
}

/** What the voice is doing, in words: what is heard as it is said (the newest words kept in view), the line being spoken, or the short line after an undo, with Mute while a line plays and Muted once it is on. Draws nothing while idle unless it carries the controls or the voice is muted. */
function VoiceStatus({
  hasControls = false,
  onBlocked,
  screen = null,
}: VoiceStatusProps) {
  const voice = useHelmVoiceContext();
  const isLoud = voice.state === 'listening' || voice.state === 'speaking';
  const text =
    voice.state === 'listening'
      ? voice.heard || HELM_COPY.talkListeningHint
      : voice.state === 'speaking'
        ? voice.saying
        : voice.state === 'idle'
          ? (voice.note ?? '')
          : '';
  const isIdle = voice.state === 'idle';
  const isWorking = voice.state === 'thinking' || voice.state === 'speaking';
  if (text === '' && !(hasControls && isIdle) && !voice.isMuted) return null;

  return (
    <div
      role='status'
      aria-live='polite'
      className='flex flex-col items-center gap-3 text-center'
    >
      {text !== '' && voice.state === 'listening' && (
        // A long sentence keeps its newest words in view: the start is what gives way.
        <div className='flex max-h-[84px] flex-col justify-end overflow-hidden'>
          <p className='text-[20px] leading-7 font-medium text-balance break-words'>
            {text}
          </p>
        </div>
      )}
      {text !== '' && voice.state !== 'listening' && (
        <p
          className={join(
            'max-h-36 overflow-y-auto text-balance break-words',
            isLoud
              ? 'text-[22px] leading-7 font-medium'
              : 'text-muted-foreground text-[15px]',
          )}
        >
          {text}
        </p>
      )}
      {!(hasControls && isWorking) && (
        <MuteControl shows={voice.isMuted ? 'whileMuted' : 'whileSpeaking'} />
      )}
      {hasControls && voice.state === 'listening' && (
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='secondary'
            className={BUTTON}
            onClick={voice.cancel}
          >
            <X className='size-4' aria-hidden='true' />
            {HELM_COPY.talkCancel}
          </Button>
          <Button
            type='button'
            variant='primary'
            className={BUTTON}
            onClick={() => voice.talk(null)}
          >
            <ArrowUp className='size-4' aria-hidden='true' />
            {HELM_COPY.send}
          </Button>
        </div>
      )}
      {hasControls && isWorking && (
        <div className='flex gap-2'>
          <MuteControl shows={voice.isMuted ? 'whileMuted' : 'whileSpeaking'} />
          <Button
            type='button'
            variant='secondary'
            className={BUTTON}
            onClick={() => voice.talk(null)}
          >
            <Square className='size-3.5 fill-current' aria-hidden='true' />
            {HELM_COPY.talkStop}
          </Button>
        </div>
      )}
      {hasControls && isIdle && (
        <Button
          type='button'
          variant='secondary'
          className={BUTTON}
          onClick={() => {
            if (voice.talk(screen) === 'blocked') onBlocked?.();
          }}
        >
          <Mic className='size-4' aria-hidden='true' />
          {HELM_COPY.talk}
        </Button>
      )}
    </div>
  );
}

export default VoiceStatus;
