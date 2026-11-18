import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Lock } from 'lucide-react';

import DebugDetails from '@/components/DebugDetails';
import { useSteadyBusy } from '@/hooks/useSteadyBusy';
import { HELM_COPY } from '@apps/helm/constants';

interface CannotOpenStateProps {
  isRetrying: boolean;
  /** A Try again has already failed, so the card says it is still refused. */
  hasRetryFailed: boolean;
  /** What the server or the browser said, for debug viewers. */
  failure: { message: string; code: string | null } | null;
  onRetry: () => void;
}

/** The server refused the data key: nothing was lost, and Try again asks for it once more. */
function CannotOpenState({
  isRetrying,
  hasRetryFailed,
  failure,
  onRetry,
}: CannotOpenStateProps) {
  const isWorking = useSteadyBusy(isRetrying);

  return (
    <section className='helm-card flex flex-col gap-2 p-4' role='alert'>
      <Lock className='text-muted-foreground size-[18px]' aria-hidden='true' />
      <h2 className='helm-serif text-[22px] leading-7'>
        {HELM_COPY.cannotOpenTitle}
      </h2>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.cannotOpenBody}
      </p>
      {hasRetryFailed && (
        <p className='text-[15px] text-pretty'>{HELM_COPY.stillCannotOpen}</p>
      )}
      <Button
        type='button'
        variant='secondary'
        size='sm'
        rounded='full'
        className="relative mt-2 self-start before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
        loading={isWorking}
        onClick={onRetry}
      >
        {HELM_COPY.tryAgain}
      </Button>
      {failure && (
        <DebugDetails
          message={failure.message}
          facts={[
            ...(failure.code ? [`Code: ${failure.code}`] : []),
            ...(failure.code === 'functions/failed-precondition'
              ? [
                  'The functions log names the cause: helm.keys.keyringInvalid or helm.keys.unwrapFailed.',
                  'In a local run, functions/.secret.local must hold the HELM_MASTER_KEYS the seed used; npm run local:app pins it.',
                ]
              : []),
          ]}
        />
      )}
    </section>
  );
}

export default CannotOpenState;
