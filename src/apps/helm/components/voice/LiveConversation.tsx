import { useEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Mic, MicOff, X } from 'lucide-react';

import MuteControl from '@apps/helm/components/voice/MuteControl';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';

const ROUND =
  "relative size-16 min-w-16 rounded-full! p-0 before:absolute before:-inset-1 before:content-['']";

const toStatus = (
  state: string,
  isMicMuted: boolean,
  isPreparing: boolean,
): string => {
  if (isMicMuted) return HELM_COPY.liveMicMuted;
  if (state === 'listening') {
    return isPreparing ? HELM_COPY.talkGettingReady : HELM_COPY.liveListening;
  }
  if (state === 'speaking') return HELM_COPY.liveSpeaking;
  if (state === 'thinking') return HELM_COPY.liveThinking;
  return HELM_COPY.liveListening;
};

/** The screen of a live conversation: a glow that breathes while it listens, swells with each new word, drifts while it works and shimmers while it speaks; the current exchange in large text; Mute (the microphone) and End. */
function LiveConversation() {
  const voice = useHelmVoiceContext();
  const name = useAssistantName();
  const dialog = useRef<HTMLDivElement>(null);
  const isHearing = voice.state === 'listening' && voice.heard !== '';
  const personLine = isHearing ? voice.heard : voice.liveSaid;
  const helmLine = isHearing ? '' : voice.lastLine;
  const glow = voice.isLiveMuted
    ? 'muted'
    : voice.state === 'idle'
      ? 'listening'
      : voice.state;
  const wordCount = voice.heard.split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  return (
    <div
      ref={dialog}
      role='dialog'
      aria-modal='true'
      aria-label={HELM_COPY.liveLabel(name)}
      tabIndex={-1}
      className='bg-background fixed inset-0 z-50 flex flex-col overflow-hidden outline-none'
      onKeyDown={(event) => {
        if (event.key === 'Escape') voice.endLive();
      }}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        data-glow={glow}
      >
        <span className='helm-live-glow' />
        {isHearing && <span key={wordCount} className='helm-live-ripple' />}
      </div>
      <div className='relative mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col justify-center gap-5 overflow-y-auto px-6 pt-[max(3rem,env(safe-area-inset-top))]'>
        <div className='flex min-h-8 items-center justify-between gap-3'>
          <p
            aria-live='polite'
            className='text-muted-foreground text-[15px] font-medium'
          >
            {toStatus(voice.state, voice.isLiveMuted, voice.isPreparing)}
          </p>
          <MuteControl shows='whileMuted' />
        </div>
        {personLine !== '' && (
          <p
            className={join(
              'text-[26px] leading-snug font-medium text-pretty',
              !isHearing && 'text-muted-foreground',
            )}
          >
            {personLine}
          </p>
        )}
        {helmLine !== '' && (
          <p className='text-[26px] leading-snug text-pretty'>{helmLine}</p>
        )}
        {voice.liveSaid === '' && !isHearing && (
          <p className='text-muted-foreground text-[15px]'>
            {HELM_COPY.liveEndHint}
          </p>
        )}
        {voice.note !== null && voice.note !== helmLine && (
          <p className='text-muted-foreground text-[15px]'>{voice.note}</p>
        )}
      </div>
      <div className='relative flex items-start justify-center gap-12 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]'>
        <div className='flex flex-col items-center gap-1.5'>
          <Button
            type='button'
            variant='secondary'
            aria-label={
              voice.isLiveMuted
                ? HELM_COPY.liveUnmuteLabel
                : HELM_COPY.liveMuteLabel
            }
            aria-pressed={voice.isLiveMuted}
            className={ROUND}
            onClick={() => voice.setLiveMuted(!voice.isLiveMuted)}
          >
            {voice.isLiveMuted ? (
              <MicOff className='size-6' aria-hidden='true' />
            ) : (
              <Mic className='size-6' aria-hidden='true' />
            )}
          </Button>
          <span className='text-[13px] font-medium'>
            {voice.isLiveMuted ? HELM_COPY.liveUnmute : HELM_COPY.liveMute}
          </span>
        </div>
        <div className='flex flex-col items-center gap-1.5'>
          <Button
            type='button'
            variant='destructive'
            aria-label={HELM_COPY.liveEndLabel}
            className={ROUND}
            onClick={voice.endLive}
          >
            <X className='size-6' aria-hidden='true' />
          </Button>
          <span className='text-[13px] font-medium'>{HELM_COPY.liveEnd}</span>
        </div>
      </div>
    </div>
  );
}

export default LiveConversation;
