import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Mic, Square } from 'lucide-react';

import VoiceStateRing from '@apps/helm/components/voice/VoiceStateRing';
import { HELM_COPY } from '@apps/helm/constants';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';

interface VoiceControlProps {
  /** Talking isn't possible here (no recognition, or the microphone is refused): the person types instead. */
  onBlocked: () => void;
}

const CAPTION = {
  idle: HELM_COPY.talk,
  listening: HELM_COPY.talkListening,
  thinking: HELM_COPY.talkStop,
  speaking: HELM_COPY.talkStop,
} as const;

/** The dock's Talk button: tap to listen, tap again to send, and it becomes Stop while the turn is being worked on or spoken. */
function VoiceControl({ onBlocked }: VoiceControlProps) {
  const voice = useHelmVoiceContext();
  const isStop = voice.state === 'thinking' || voice.state === 'speaking';
  const label = isStop
    ? HELM_COPY.talkStop
    : voice.state === 'listening'
      ? HELM_COPY.talkSendLabel
      : HELM_COPY.talk;

  return (
    <div className='flex w-16 flex-col items-center gap-1'>
      <VoiceStateRing state={voice.state}>
        <Button
          type='button'
          variant='primary'
          aria-label={label}
          className="relative size-[68px] min-w-[68px] rounded-full! p-0 before:absolute before:-inset-1 before:content-['']"
          onClick={() => {
            if (voice.talk(null) === 'blocked') onBlocked();
          }}
        >
          {isStop ? (
            <Square className='size-6 fill-current' aria-hidden='true' />
          ) : (
            <Mic className='size-7' aria-hidden='true' />
          )}
        </Button>
      </VoiceStateRing>
      <span className='text-[13px] font-medium'>{CAPTION[voice.state]}</span>
    </div>
  );
}

export default VoiceControl;
