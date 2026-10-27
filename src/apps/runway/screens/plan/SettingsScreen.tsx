import { useState, type ReactNode } from 'react';
import InlineNotice from '@/components/InlineNotice';
import { Activity, ChevronRight, Gauge, Trash2 } from 'lucide-react';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { PillGroup } from '@/components/PillGroup';
import Subview from '@/components/Subview';
import SummaryEditor from '@/components/SummaryEditor';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  DELETE_PLAN_WORDS,
  STANCE_HELP,
  STANCE_LABELS,
  STANCES,
  TRACKING_WORDS,
} from '@apps/runway/constants';
import { getOpenPeriod } from '@apps/runway/engine/level';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { setStance } from '@apps/runway/store/actions/planActions';
import { selectStance } from '@apps/runway/store/selectors/runwaySelectors';
import type { Stance } from '@apps/runway/types';

const stanceOptions = STANCES.map((value) => ({
  value,
  label: STANCE_LABELS[value],
}));

interface SettingsRowProps {
  icon: ReactNode;
  label: string;
  value: string;
  isDestructive?: boolean;
  onOpen: () => void;
}

/** A row that opens a settings view, drawn like the stance's summary row so the screen has one anatomy. */
function SettingsRow({
  icon,
  label,
  value,
  isDestructive = false,
  onOpen,
}: SettingsRowProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border hover:bg-muted text-foreground! h-auto min-h-16 w-full items-start justify-start gap-3 rounded-2xl border px-3! py-2 text-left font-normal whitespace-normal'
      onClick={onOpen}
    >
      <span
        className={join(
          'mt-0.5 grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-5',
          isDestructive
            ? 'bg-destructive/10 text-destructive'
            : 'bg-accent text-accent-foreground',
        )}
        aria-hidden='true'
      >
        {icon}
      </span>
      <span className='flex min-h-11 min-w-0 flex-1 flex-col justify-center'>
        <span
          className={join(
            'block text-base',
            isDestructive && 'text-destructive',
          )}
        >
          {label}
        </span>
        <span className='text-muted-foreground block text-sm'>{value}</span>
      </span>
      <ChevronRight
        className='text-muted-foreground mt-3 -ml-1 size-5 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

interface SettingsScreenProps {
  onClose: () => void;
}

/** How the whole plan reads a range of pay or a bill; one pay line or bill can plan at its own end instead. */
function SettingsScreen({ onClose }: SettingsScreenProps) {
  const { user } = useAuth();
  const stance = useAppSelector(selectStance);
  const periods = useAppSelector(
    (state) => state.runway.plan?.trackingPeriods ?? [],
  );
  const { openSettingsView } = useRunwayUrlState();
  const open = getOpenPeriod(periods);
  const [error, setError] = useState<string | null>(null);

  const choose = async (next: Stance) => {
    if (!user) return;
    setError(null);
    try {
      await setStance(user.uid, next);
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          'The stance did not save. Nothing was changed.',
        ),
      );
    }
  };

  return (
    <Subview title='Settings' onClose={onClose}>
      <div className='space-y-3'>
        <SummaryEditor
          label='Planning stance'
          summary={STANCE_LABELS[stance]}
          placeholder=''
          title='Planning stance'
          icon={<Gauge />}
          isFramed
          shouldFocus={false}
        >
          <PillGroup
            label='Planning stance'
            options={stanceOptions}
            value={stance}
            onChange={(next) => void choose(next)}
          />
          <InlineNotice tone='info'>{STANCE_HELP[stance]}</InlineNotice>
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
        </SummaryEditor>
        <InlineNotice tone='info'>
          A pay line or bill with a range can plan at its own end instead. You
          choose that where you add it.
        </InlineNotice>
        <SettingsRow
          icon={<Activity />}
          label={TRACKING_WORDS.rowLabel}
          value={
            open === null
              ? 'Plan only'
              : `Track, since ${formatDateUTC(open.from)}`
          }
          onOpen={() => openSettingsView('tracking')}
        />
        <SettingsRow
          icon={<Trash2 />}
          label={DELETE_PLAN_WORDS.rowLabel}
          value={DELETE_PLAN_WORDS.rowHelp}
          isDestructive
          onOpen={() => openSettingsView('delete')}
        />
      </div>
    </Subview>
  );
}

export default SettingsScreen;
