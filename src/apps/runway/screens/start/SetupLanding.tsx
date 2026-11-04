import { ListChecks, Wallet, Target, Banknote } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { SETUP_WORDS } from '@apps/runway/constants';
import { describeCounts } from '@apps/runway/screens/start/startRows';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const STEP_ICONS = [
  <Banknote key='income' className='h-5 w-5' aria-hidden='true' />,
  <Wallet key='spend' className='h-5 w-5' aria-hidden='true' />,
  <Target key='goals' className='h-5 w-5' aria-hidden='true' />,
];

/** The whole screen until a plan has a bill, envelope or goal: no tabs, one way in. */
function SetupLanding({ isStarted }: { isStarted: boolean }) {
  const { openView } = useRunwayUrlState();
  const counts = useAppSelector((state) => {
    const count = (kind: string) =>
      state.runway.items.filter(
        (item) => item.kind === kind && item.archivedAt === null,
      ).length;
    return {
      income: count('source'),
      bill: count('bill'),
      envelope: count('envelope'),
      goal: count('goal'),
    };
  });

  return (
    <div className='page'>
      <div className='mx-auto flex min-h-[70dvh] max-w-xl flex-col justify-center space-y-6 py-6'>
        <div className='space-y-2'>
          <span className='bg-accent text-foreground inline-flex h-10 w-10 items-center justify-center rounded-full'>
            <ListChecks className='h-5 w-5' aria-hidden='true' />
          </span>
          <h1 className='text-2xl font-semibold text-balance'>
            {isStarted ? SETUP_WORDS.startedTitle : SETUP_WORDS.newTitle}
          </h1>
          <p className='text-muted-foreground text-sm text-pretty'>
            {isStarted
              ? SETUP_WORDS.startedBody(describeCounts(counts))
              : SETUP_WORDS.newBody}
          </p>
        </div>
        {!isStarted && (
          <ol className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {SETUP_WORDS.steps.map((step, index) => (
              <li key={step.title} className='flex items-center gap-3 px-4 py-3'>
                <span className='text-muted-foreground'>
                  {STEP_ICONS[index]}
                </span>
                <span className='min-w-0'>
                  <span className='block font-medium'>{step.title}</span>
                  <span className='text-muted-foreground block text-sm'>
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <Button onClick={() => openView('start')}>
          {isStarted ? SETUP_WORDS.startedAction : SETUP_WORDS.newAction}
        </Button>
      </div>
    </div>
  );
}

export default SetupLanding;
