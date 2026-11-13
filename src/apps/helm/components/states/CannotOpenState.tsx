import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Lock } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';

interface CannotOpenStateProps {
  isRetrying: boolean;
  /** A Try again has already failed, so the card says it is still refused. */
  hasRetryFailed: boolean;
  onRetry: () => void;
}

/** The server refused the data key: nothing was lost, and Try again asks for it once more. */
function CannotOpenState({
  isRetrying,
  hasRetryFailed,
  onRetry,
}: CannotOpenStateProps) {
  return (
    <section className='helm-card flex flex-col gap-2 p-4' role='alert'>
      <Lock className='text-muted-foreground size-[18px]' aria-hidden='true' />
      <h2 className='helm-serif text-[22px] leading-7'>
        {HELM_COPY.cannotOpenTitle}
      </h2>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.cannotOpenBody}
      </p>
      {hasRetryFailed && !isRetrying && (
        <p className='text-[15px] text-pretty'>{HELM_COPY.stillCannotOpen}</p>
      )}
      <Button
        type='button'
        variant='secondary'
        size='sm'
        rounded='full'
        className="relative mt-2 self-start before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
        loading={isRetrying}
        onClick={onRetry}
      >
        {HELM_COPY.tryAgain}
      </Button>
    </section>
  );
}

export default CannotOpenState;
