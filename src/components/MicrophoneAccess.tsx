import { useEffect, useState, useSyncExternalStore } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Mic } from 'lucide-react';

import InlineNotice from '@/components/InlineNotice';
import {
  detectMicrophoneDevice,
  getMicrophoneHowTo,
  peekMicrophonePermission,
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

/** The way out of a blocked microphone: an Allow microphone button that asks the browser properly, and, once the browser refuses, the steps to allow it on this device. Clears itself once the permission is granted. */
function MicrophoneAccess({ onAllowed, className }: MicrophoneAccessProps) {
  const [result, setResult] = useState<MicrophoneRequestResult | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const permission = useSyncExternalStore(
    watchMicrophonePermission,
    peekMicrophonePermission,
  );

  useEffect(
    () =>
      watchMicrophonePermission((state) => {
        if (state === 'granted') onAllowed?.();
      }),
    [onAllowed],
  );

  if (permission === 'granted') return null;

  const isBlocked = result === 'denied' || permission === 'denied';
  const steps = getMicrophoneHowTo(
    detectMicrophoneDevice(),
    window.location.host,
  );

  const ask = async () => {
    setIsAsking(true);
    const answer = await requestMicrophone();
    setIsAsking(false);
    setResult(answer);
    if (answer === 'granted') onAllowed?.();
  };

  return (
    <InlineNotice
      tone='warning'
      title={
        isBlocked ? 'The microphone is blocked' : 'The microphone isn’t on yet'
      }
      className={className}
    >
      <p>
        {isBlocked
          ? 'Your browser said no for this site. To turn it back on:'
          : 'Tap below and allow it when your browser asks.'}
      </p>
      {isBlocked && (
        <ol className='mt-2 list-decimal space-y-1 pl-4'>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {result !== null && RESULT_LINES[result] && (
        <p className='mt-2'>{RESULT_LINES[result]}</p>
      )}
      <Button
        type='button'
        variant='secondary'
        size='sm'
        className={join('mt-3 gap-1.5', isAsking && 'pointer-events-none')}
        onClick={() => void ask()}
      >
        <Mic className='h-4 w-4' aria-hidden='true' />
        {isBlocked ? 'Try again' : 'Allow microphone'}
      </Button>
    </InlineNotice>
  );
}

export default MicrophoneAccess;
