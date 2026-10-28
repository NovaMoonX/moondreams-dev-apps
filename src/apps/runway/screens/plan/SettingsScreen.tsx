import { useState } from 'react';
import { Gauge } from 'lucide-react';

import { PillGroup } from '@/components/PillGroup';
import Subview from '@/components/Subview';
import SummaryEditor from '@/components/SummaryEditor';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { STANCE_HELP, STANCE_LABELS, STANCES } from '@apps/runway/constants';
import { setStance } from '@apps/runway/store/actions/planActions';
import { selectStance } from '@apps/runway/store/selectors/runwaySelectors';
import type { Stance } from '@apps/runway/types';

const stanceOptions = STANCES.map((value) => ({
  value,
  label: STANCE_LABELS[value],
}));

interface SettingsScreenProps {
  onClose: () => void;
}

/** How the whole plan reads a range of pay or a bill; one pay line or bill can plan at its own end instead. */
function SettingsScreen({ onClose }: SettingsScreenProps) {
  const { user } = useAuth();
  const stance = useAppSelector(selectStance);
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
        <div className='border-border bg-card rounded-2xl border'>
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
            <p className='text-muted-foreground text-sm'>
              {STANCE_HELP[stance]}
            </p>
            {error && (
              <p className='text-destructive text-sm' role='alert'>
                {error}
              </p>
            )}
          </SummaryEditor>
        </div>
        <p className='text-muted-foreground px-1 text-sm'>
          A pay line or bill with a range can plan at its own end instead. You
          choose that where you add it.
        </p>
      </div>
    </Subview>
  );
}

export default SettingsScreen;
