import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Google } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { SETUP_WORDS } from '@apps/runway/constants';
import SetupSteps from '@apps/runway/screens/start/SetupSteps';
import { countDraft, useStartDraft } from '@apps/runway/utils/startDraft';

interface SignedOutLandingProps {
  onStart: () => void;
}

/** Everything in Runway needs an account except Starting out, which keeps its answers on this device until sign-in. */
function SignedOutLanding({ onStart }: SignedOutLandingProps) {
  const { signInWithGoogle } = useAuth();
  const draft = useStartDraft();
  const isKept = draft !== null && countDraft(draft) > 0;
  const progress = {
    income: draft?.incomes.length ?? 0,
    bill: draft?.bills.length ?? 0,
    spending: (draft?.envelopes.length ?? 0) + (draft?.goals.length ?? 0),
  };
  return (
    <div className='page'>
      <div className='mx-auto max-w-xl space-y-8 pt-16 pb-6'>
        <div className='space-y-1'>
          <h1 className='text-3xl font-semibold text-balance'>
            {isKept ? SETUP_WORDS.outKeptTitle : SETUP_WORDS.outTitle}
          </h1>
          <p className='text-muted-foreground'>
            {isKept ? SETUP_WORDS.outKeptBody : SETUP_WORDS.outBody}
          </p>
        </div>
        <SetupSteps progress={progress} />
        <div className='flex flex-col gap-2'>
          <Button size='lg' onClick={onStart}>
            {isKept ? SETUP_WORDS.outKeptAction : SETUP_WORDS.outAction}
          </Button>
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
