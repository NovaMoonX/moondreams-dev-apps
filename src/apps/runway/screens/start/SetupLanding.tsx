import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import type { RootState } from '@/store';
import { SETUP_WORDS } from '@apps/runway/constants';
import SetupSteps from '@apps/runway/screens/start/SetupSteps';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { ItemKind } from '@apps/runway/types';

const countLive = (state: RootState, kind: ItemKind) =>
  state.runway.items.filter(
    (item) => item.kind === kind && item.archivedAt === null,
  ).length;

/** The whole screen until a plan has a bill, envelope or goal: no tabs, the next step and one way in. */
function SetupLanding({ isStarted }: { isStarted: boolean }) {
  const { openView } = useRunwayUrlState();
  const income = useAppSelector((state) => countLive(state, 'source'));
  const bill = useAppSelector((state) => countLive(state, 'bill'));
  const envelope = useAppSelector((state) => countLive(state, 'envelope'));
  const goal = useAppSelector((state) => countLive(state, 'goal'));
  const isContinuing = isStarted && income > 0;

  return (
    <div className='page'>
      <div className='mx-auto max-w-xl space-y-8 pt-10 pb-6'>
        <div className='space-y-1'>
          <h1 className='text-3xl font-semibold text-balance'>
            {isContinuing ? SETUP_WORDS.startedTitle : SETUP_WORDS.newTitle}
          </h1>
          <p className='text-muted-foreground'>
            {isContinuing ? SETUP_WORDS.startedBody : SETUP_WORDS.newBody}
          </p>
        </div>
        <SetupSteps progress={{ income, bill, spending: envelope + goal }} />
        <Button size='lg' className='w-full' onClick={() => openView('start')}>
          {isContinuing ? SETUP_WORDS.startedAction : SETUP_WORDS.newAction}
        </Button>
      </div>
    </div>
  );
}

export default SetupLanding;
