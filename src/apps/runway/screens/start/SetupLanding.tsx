import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { SETUP_WORDS } from '@apps/runway/constants';
import { describeCounts } from '@apps/runway/screens/start/startRows';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import type { RootState } from '@/store';
import type { ItemKind } from '@apps/runway/types';

const countLive = (state: RootState, kind: ItemKind) =>
  state.runway.items.filter(
    (item) => item.kind === kind && item.archivedAt === null,
  ).length;

/** The whole screen until a plan has a bill, envelope or goal: no tabs, one way in. */
function SetupLanding({ isStarted }: { isStarted: boolean }) {
  const { openView, openMoreEntry } = useRunwayUrlState();
  const income = useAppSelector((state) => countLive(state, 'source'));
  const bill = useAppSelector((state) => countLive(state, 'bill'));
  const envelope = useAppSelector((state) => countLive(state, 'envelope'));
  const goal = useAppSelector((state) => countLive(state, 'goal'));
  const added = describeCounts({ income, bill, envelope, goal });
  const isContinuing = isStarted && added !== '';

  return (
    <div className='page'>
      <div className='mx-auto flex min-h-[70dvh] max-w-xl flex-col justify-center space-y-6 py-6'>
        <div className='space-y-2'>
          <h1 className='text-2xl font-semibold text-balance'>
            {isContinuing ? SETUP_WORDS.startedTitle : SETUP_WORDS.newTitle}
          </h1>
          <p className='text-muted-foreground text-sm text-pretty'>
            {isContinuing
              ? SETUP_WORDS.startedBody(added)
              : SETUP_WORDS.newBody}
          </p>
        </div>
        <Button onClick={() => openView('start')}>
          {isContinuing ? SETUP_WORDS.startedAction : SETUP_WORDS.newAction}
        </Button>
        {isStarted && (
          <Button variant='tertiary' onClick={() => openMoreEntry('settings')}>
            {SETUP_WORDS.settings}
          </Button>
        )}
      </div>
    </div>
  );
}

export default SetupLanding;
