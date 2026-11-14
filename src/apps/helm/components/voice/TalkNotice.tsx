import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import MicrophoneAccess from '@/components/MicrophoneAccess';
import SpeechDebugDetails from '@/components/SpeechDebugDetails';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';

import { HELM_COPY } from '@apps/helm/constants';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';

interface TalkNoticeProps {
  className?: string;
}

/** Why Talk can't listen, shown where it was tapped. */
function TalkNotice({ className }: TalkNoticeProps) {
  const voice = useHelmVoiceContext();
  const microphone = useMicrophonePermission();
  if (voice.notice === null) return null;

  const isMicrophone = voice.needsMicrophone && microphone !== 'granted';
  const line =
    voice.needsMicrophone && microphone === 'granted'
      ? HELM_COPY.talkNeedsRecognition
      : voice.notice;

  return (
    <div
      className={join(
        'text-muted-foreground flex max-h-[45dvh] w-full flex-col items-start gap-2 overflow-y-auto overscroll-contain text-[13px]',
        className,
      )}
      role='status'
    >
      {isMicrophone ? (
        <MicrophoneAccess onAllowed={voice.clearNotice} className='w-full' />
      ) : (
        <p className='text-pretty'>{line}</p>
      )}
      {!isMicrophone && line === HELM_COPY.talkNeedsRecognition && (
        <SpeechDebugDetails message={line} className='w-full' />
      )}
      {voice.hasNoticeDoor && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="text-primary relative -ml-2 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          onClick={() => void voice.openVoiceSettings()}
        >
          {HELM_COPY.talkOpenVoiceSettings}
        </Button>
      )}
    </div>
  );
}

export default TalkNotice;
