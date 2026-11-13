import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Volume2, VolumeX } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';

interface MuteControlProps {
  /** Offers Mute while a line is spoken, or, once muted, says so and offers the voice back. */
  shows: 'whileSpeaking' | 'whileMuted';
}

/** Mute silences spoken lines until Helm is closed, and the replies stay written. */
function MuteControl({ shows }: MuteControlProps) {
  const voice = useHelmVoiceContext();
  const isShown =
    shows === 'whileMuted'
      ? voice.isMuted
      : voice.state === 'speaking' && !voice.isMuted;
  if (!isShown) return null;

  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      rounded='full'
      aria-label={voice.isMuted ? HELM_COPY.talkUnmute : HELM_COPY.talkMute}
      aria-pressed={voice.isMuted}
      className="relative h-8 min-h-0 gap-1 px-3 text-[13px] before:absolute before:-inset-x-1 before:-inset-y-1 before:content-['']"
      onClick={() => voice.setMuted(!voice.isMuted)}
    >
      {voice.isMuted ? (
        <VolumeX className='size-3.5' aria-hidden='true' />
      ) : (
        <Volume2 className='size-3.5' aria-hidden='true' />
      )}
      {voice.isMuted ? HELM_COPY.talkMuted : HELM_COPY.talkMute}
    </Button>
  );
}

export default MuteControl;
