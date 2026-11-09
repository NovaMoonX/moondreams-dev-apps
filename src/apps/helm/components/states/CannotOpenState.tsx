import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Lock } from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';

interface CannotOpenStateProps {
  isRetrying: boolean;
  onRetry: () => void;
}

/** The server refused the data key: nothing was lost, and Try again asks for it once more. */
function CannotOpenState({ isRetrying, onRetry }: CannotOpenStateProps) {
  return (
    <section className='helm-card flex flex-col gap-2 p-4' role='alert'>
      <Lock className='text-muted-foreground size-5' aria-hidden='true' />
      <h2 className='helm-serif text-[19px] leading-6'>
        {HELM_COPY.cannotOpenTitle}
      </h2>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.cannotOpenBody}
      </p>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        rounded='full'
        className='mt-2 self-start'
        loading={isRetrying}
        onClick={onRetry}
      >
        {HELM_COPY.tryAgain}
      </Button>
    </section>
  );
}

export default CannotOpenState;
