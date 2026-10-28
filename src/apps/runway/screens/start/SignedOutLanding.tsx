import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Google } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { START_WORDS } from '@apps/runway/constants';

interface SignedOutLandingProps {
  onStart: () => void;
}

/** Everything in Runway needs an account except Starting out, which keeps its answers on this device until sign-in. */
function SignedOutLanding({ onStart }: SignedOutLandingProps) {
  const { signInWithGoogle } = useAuth();
  return (
    <div className='page pt-20'>
      <div className='border-border bg-card mx-auto max-w-xl space-y-4 rounded-2xl border p-6'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>{START_WORDS.landingTitle}</h1>
          <p className='text-muted-foreground text-sm text-pretty'>
            {START_WORDS.landingBody}
          </p>
        </div>
        <div className='flex flex-col gap-2'>
          <Button onClick={onStart}>{START_WORDS.landingButton}</Button>
          <Button
            variant='secondary'
            className='gap-2'
            onClick={() => void signInWithGoogle()}
          >
            <Google className='size-4' />
            Sign in with Google
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SignedOutLanding;
