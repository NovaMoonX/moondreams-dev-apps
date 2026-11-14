import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ArrowUp, CircleHelp, Mic, Square, X } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import HeardWords from '@apps/helm/components/voice/HeardWords';
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

export function VoiceNotice() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className={join(BUTTON, 'text-muted-foreground gap-1.5 text-[13px]')}
        onClick={() => setIsOpen(true)}
      >
        <CircleHelp className='size-3.5' aria-hidden='true' />
        {HELM_COPY.voiceNoticeTitle}
      </Button>
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={HELM_COPY.voiceNoticeTitle}
      >
        <p className='text-[15px] text-pretty'>{HELM_COPY.voiceNotice}</p>
      </DetailSheet>
    </>
  );
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
      ? voice.heard ||
        (voice.isPreparing
          ? HELM_COPY.talkGettingReady
          : HELM_COPY.talkListeningHint)
      : voice.state === 'speaking'
        ? voice.saying
        : voice.state === 'idle'
          ? (voice.note ?? '')
          : '';
  const isIdle = voice.state === 'idle';
  const isWorking = voice.state === 'thinking' || voice.state === 'speaking';
  const showsPhoneLine = isIdle && voice.showsPhoneLine;
  const closedLine = isIdle ? voice.closed : null;
  if (voice.isDictating) return null;
  if (
    text === '' &&
    closedLine === null &&
    !(hasControls && isIdle) &&
    !voice.isMuted &&
    !showsPhoneLine
  ) {
    return null;
  }

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
            {voice.heard === '' ? (
              text
            ) : (
              <HeardWords
                text={text}
                swaps={voice.heardSwaps}
                onRestore={voice.restoreHeard}
              />
            )}
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
      {voice.state === 'listening' && voice.listeningRoute === 'cloud' && (
        <VoiceNotice />
      )}
      {closedLine !== null && (
        <div className='flex items-center gap-1'>
          <p className='text-muted-foreground text-[15px]'>
            {HELM_COPY.closedLeft}
          </p>
          {closedLine.hasDropped && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className="relative gap-1 text-[15px] before:absolute before:-inset-x-2 before:-inset-y-2 before:content-['']"
              onClick={() => void voice.undoClose()}
            >
              {HELM_COPY.closedUndo}
            </Button>
          )}
        </div>
      )}
      {showsPhoneLine && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.voiceOnPhone}
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
            onClick={() =>
              voice.talk(voice.state === 'speaking' ? screen : null)
            }
          >
            {voice.state === 'speaking' ? (
              <Mic className='size-4' aria-hidden='true' />
            ) : (
              <Square className='size-3.5 fill-current' aria-hidden='true' />
            )}
            {voice.state === 'speaking' ? HELM_COPY.talk : HELM_COPY.talkStop}
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
