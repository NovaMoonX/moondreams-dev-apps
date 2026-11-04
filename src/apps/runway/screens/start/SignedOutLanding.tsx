import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Google } from '@moondreamsdev/dreamer-ui/symbols';

import { useAuth } from '@/hooks/useAuth';
import { START_WORDS } from '@apps/runway/constants';
import { describeCounts } from '@apps/runway/screens/start/startRows';
import { countDraft, useStartDraft } from '@apps/runway/utils/startDraft';

interface SignedOutLandingProps {
  onStart: () => void;
}

/** Everything in Runway needs an account except Starting out, which keeps its answers on this device until sign-in. */
function SignedOutLanding({ onStart }: SignedOutLandingProps) {
  const { signInWithGoogle } = useAuth();
  const draft = useStartDraft();
  const isKept = draft !== null && countDraft(draft) > 0;
  return (
    <div className='page pt-20'>
      <div className='border-border bg-card mx-auto max-w-xl space-y-4 rounded-2xl border p-6'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>{isKept ? START_WORDS.resumeAsk : START_WORDS.landingTitle}</h1>
          <p className='text-muted-foreground text-sm text-pretty'>
            {isKept
              ? START_WORDS.resumeSummary(
                  describeCounts({
                    income: draft.incomes.length,
                    bill: draft.bills.length,
                    envelope: draft.envelopes.length,
                    goal: draft.goals.length,
                  }),
                )
              : START_WORDS.landingBody}
          </p>
        </div>
        <div className='flex flex-col gap-2'>
          <Button onClick={onStart}>
            {isKept ? START_WORDS.resumeContinue : START_WORDS.landingButton}
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
