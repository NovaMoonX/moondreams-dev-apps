import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Mic } from 'lucide-react';

import InlineNotice from '@/components/InlineNotice';
import SpeechDebugDetails from '@/components/SpeechDebugDetails';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import {
  NOTICE_ACTION_CLASSES,
  NOTICE_QUIET_CLASSES,
} from '@/components/noticeActionClasses';
import {
  detectMicrophoneDevice,
  getMicrophoneHowTo,
  requestMicrophone,
  watchMicrophonePermission,
  type MicrophoneRequestResult,
} from '@/lib/speech/microphonePermission';

interface MicrophoneAccessProps {
  /** Runs once the browser lets this site use the microphone, from the button or from its settings. */
  onAllowed?: () => void;
  className?: string;
}

const RESULT_LINES: Partial<Record<MicrophoneRequestResult, string>> = {
  'no-microphone': 'No microphone was found on this device.',
  unavailable: 'This browser can’t use a microphone here.',
};

/** The way out of a blocked microphone: an Allow microphone button that asks the browser properly and, once the browser refuses, how to allow it on this device behind one tap. Clears itself once the permission is granted. */
function MicrophoneAccess({ onAllowed, className }: MicrophoneAccessProps) {
  const [result, setResult] = useState<MicrophoneRequestResult | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isHowToOpen, setIsHowToOpen] = useState(false);
  const permission = useMicrophonePermission();

  const allowed = useRef(onAllowed);
  useEffect(() => {
    allowed.current = onAllowed;
  });
  useEffect(
    () =>
      watchMicrophonePermission((state) => {
        if (state === 'granted') allowed.current?.();
      }),
    [],
  );

  if (permission === 'granted') return null;

  // An installed app on Android can refuse without a prompt and still read "prompt", so a refused ask counts as blocked.
  const isBlocked = permission === 'denied' || result === 'denied';
  const tone = isBlocked ? 'warning' : 'info';
  const canAsk = result !== 'unavailable';

  const ask = async () => {
    setIsAsking(true);
    const answer = await requestMicrophone();
    setIsAsking(false);
    setResult(answer);
  };

  return (
    <InlineNotice
      tone={tone}
      title={
        isBlocked ? 'The microphone is blocked' : 'The microphone isn’t on yet'
      }
      className={className}
    >
      <p>
        {isBlocked
          ? 'Your browser said no for this site, so it has to be allowed in its settings.'
          : 'Tap below and allow it when your browser asks.'}
      </p>
      {result !== null && RESULT_LINES[result] && (
        <p className='mt-2'>{RESULT_LINES[result]}</p>
      )}
      {isBlocked && isHowToOpen && (
        <ol className='mt-2 list-decimal space-y-1 pl-4'>
          {getMicrophoneHowTo(
            detectMicrophoneDevice(),
            window.location.host,
          ).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      <div className='mt-3 flex flex-wrap items-center gap-x-4 gap-y-2'>
        {canAsk && (
          <Button
            type='button'
            variant='primary'
            size='sm'
            className={join(
              'gap-1.5',
              NOTICE_ACTION_CLASSES[tone],
              isAsking && 'pointer-events-none',
            )}
            onClick={() => void ask()}
          >
            <Mic className='h-4 w-4' aria-hidden='true' />
            {isBlocked ? 'Try again' : 'Allow microphone'}
          </Button>
        )}
        {isBlocked && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            aria-expanded={isHowToOpen}
            className={NOTICE_QUIET_CLASSES.warning}
            onClick={() => setIsHowToOpen((isOpen) => !isOpen)}
          >
            {isHowToOpen ? 'Hide how' : 'How to allow it'}
          </Button>
        )}
      </div>
      <SpeechDebugDetails
        message={`Microphone ${permission}; last ask: ${result ?? 'not yet'}`}
        className='mt-3'
      />
    </InlineNotice>
  );
}

export default MicrophoneAccess;
