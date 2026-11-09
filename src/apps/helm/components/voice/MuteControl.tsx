import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Volume2, VolumeX } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';

interface MuteControlProps {
  /** Where it is drawn: beside the line being spoken (offers Mute), or in home's header once muted (offers it back). */
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
      className="relative h-7 min-h-0 gap-1 px-2.5 text-[13px] before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
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
