import { useState } from 'react';

import { Pause } from 'lucide-react';

import AppToggle from '@/components/AppToggle';
import SettingsRow from '@/components/SettingsRow';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { SORTING_WORDS } from '@apps/runway/constants';
import { setSortingPaused } from '@apps/runway/store/actions/planActions';
import { selectIsSortingPaused } from '@apps/runway/store/selectors/runwaySelectors';

/** The "I'm not sorting yet" switch: it writes at once and shows its own failure, so nothing else on the screen is locked. */
function SortingPausedRow() {
  const { user } = useAuth();
  const isPaused = useAppSelector(selectIsSortingPaused);
  const [message, setMessage] = useState<string | null>(null);

  const handleChange = async (isChecked: boolean) => {
    if (!user) return;
    setMessage(null);
    try {
      await setSortingPaused(user.uid, isChecked);
    } catch (error) {
      setMessage(getErrorMessage(error, SORTING_WORDS.saveFailed));
    }
  };

  return (
    <ul className='border-border rounded-2xl border px-3'>
      <SettingsRow
        icon={<Pause className='size-5' />}
        title={SORTING_WORDS.label}
        description={
          <>
            {isPaused ? SORTING_WORDS.helpOn : SORTING_WORDS.helpOff}
            {message && (
              <span className='text-destructive mt-1 block' role='alert'>
                {message}
              </span>
            )}
          </>
        }
        control={
          <AppToggle
            aria-label={SORTING_WORDS.label}
            checked={isPaused}
            onCheckedChange={(isChecked) => void handleChange(isChecked)}
          />
        }
      />
    </ul>
  );
}

export default SortingPausedRow;
