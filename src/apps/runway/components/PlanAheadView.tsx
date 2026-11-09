import type { ReactNode } from 'react';

import {
  CalendarClock,
  CalendarOff,
  Pause,
  PiggyBank,
  Repeat,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import { ActionTitle } from '@apps/runway/components/ActionSection';
import { COMING_WORDS } from '@apps/runway/constants';

export type PlanAheadChoice =
  'amount' | 'stretch' | 'stop' | 'pause' | 'stopSaving';

interface PlanAheadViewProps {
  /** Which of the later ways to change this item are open to it. */
  choices: readonly PlanAheadChoice[];
  onPick: (choice: PlanAheadChoice) => void;
  onBack: () => void;
}

const ROWS: Record<
  PlanAheadChoice,
  { icon: ReactNode; label: string; subtitle: string }
> = {
  amount: {
    icon: <CalendarClock />,
    label: COMING_WORDS.planAmount,
    subtitle: COMING_WORDS.planAmountSub,
  },
  stretch: {
    icon: <Repeat />,
    label: COMING_WORDS.planStretch,
    subtitle: COMING_WORDS.planStretchSub,
  },
  stop: {
    icon: <CalendarOff />,
    label: COMING_WORDS.planStop,
    subtitle: COMING_WORDS.planStopSub,
  },
  pause: {
    icon: <Pause />,
    label: COMING_WORDS.planPause,
    subtitle: COMING_WORDS.planPauseSub,
  },
  stopSaving: {
    icon: <PiggyBank />,
    label: COMING_WORDS.planStopSaving,
    subtitle: COMING_WORDS.planStopSavingSub,
  },
};

/** "What will change?": the ways to change an item on a later date, each opening its own form already set to one. */
function PlanAheadView({ choices, onPick, onBack }: PlanAheadViewProps) {
  return (
    <div className='flex flex-1 flex-col gap-4'>
      <BackLink onBack={onBack} />
      <ActionTitle>{COMING_WORDS.planTitle}</ActionTitle>
      {choices.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{COMING_WORDS.planNone}</p>
      ) : (
        <ActionGroup isRoomy>
          {choices.map((choice) => (
            <ActionRow
              key={choice}
              isGrouped
              isRoomy
              hasChevron
              icon={ROWS[choice].icon}
              label={ROWS[choice].label}
              subtitle={ROWS[choice].subtitle}
              onClick={() => onPick(choice)}
            />
          ))}
        </ActionGroup>
      )}
    </div>
  );
}

export default PlanAheadView;
