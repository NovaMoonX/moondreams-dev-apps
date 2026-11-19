import { join } from '@moondreamsdev/dreamer-ui/utils';

import HelpTip from '@/components/HelpTip';
import { formatDateShort } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenHabit } from '@apps/helm/types';

const NOTCHES = ['building', 'holding', 'formed'] as const;

const readCurrent = (stage: OpenHabit['stage']) =>
  stage === 'buildingAgain' ? 'building' : (stage ?? 'building');

interface HabitStageProps {
  habit: Pick<OpenHabit, 'stage' | 'stageAt' | 'forWhoId'>;
}

/** Where a habit stands: three named notches and the day it got there, with the plain words on how the app works it out. A habit kept for someone else has no stage and draws nothing. */
function HabitStage({ habit }: HabitStageProps) {
  if (habit.forWhoId !== null || habit.stage === null) return null;
  const current = readCurrent(habit.stage);
  return (
    <div className='space-y-1.5'>
      <div className='flex items-center gap-2'>
        <ol className='flex min-w-0 flex-1 items-center gap-1.5'>
          {NOTCHES.map((notch) => (
            <li
              key={notch}
              aria-current={notch === current ? 'step' : undefined}
              className={join(
                'flex min-w-0 flex-1 items-center gap-1.5 text-[13px]',
                notch === current
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground',
              )}
            >
              <span
                className={join(
                  'h-1.5 w-full max-w-6 shrink rounded-full',
                  notch === current ? 'bg-primary' : 'bg-border',
                )}
                aria-hidden='true'
              />
              <span className='truncate'>
                {HELM_COPY.stageLabel(notch)}
                {notch === current && habit.stage === 'buildingAgain' && (
                  <span className='ml-1 text-[13px] font-semibold'>
                    {HELM_COPY.stageAgain}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
        <HelpTip title={HELM_COPY.stageHelpLabel}>
          {HELM_COPY.stageHelp}
        </HelpTip>
      </div>
      <p className='text-muted-foreground text-[13px]'>
        {HELM_COPY.stageSince(formatDateShort(habit.stageAt))}
      </p>
    </div>
  );
}

export default HabitStage;
