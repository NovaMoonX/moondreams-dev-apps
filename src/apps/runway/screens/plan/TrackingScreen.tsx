import { useState } from 'react';

import InlineNotice from '@/components/InlineNotice';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';

import { PillGroup } from '@/components/PillGroup';
import ShowMoreButton from '@/components/ShowMoreButton';
import Subview from '@/components/Subview';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import LevelGate from '@apps/runway/components/LevelGate';
import { LEVELS, LEVEL_LABELS, TRACKING_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getOpenPeriod } from '@apps/runway/engine/level';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { moveToPlan } from '@apps/runway/store/actions/planActions';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import LineUpScreen from '@apps/runway/screens/plan/LineUpScreen';
import type { Level } from '@apps/runway/types';

const PERIODS_PREVIEW = 3;
const levelOptions = LEVELS.map((value) => ({
  value,
  label: LEVEL_LABELS[value],
}));

interface TrackingScreenProps {
  onClose: () => void;
}

/** Plan or Track for the whole plan, and the stretches tracking has been on. Moving up lines the money up first; moving down keeps everything. */
function TrackingScreen({ onClose }: TrackingScreenProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const today = todayAsUtcDate(useNow(60_000));
  const level = useAppSelector(selectLevel);
  const periods = useAppSelector(
    (state) => state.runway.plan?.trackingPeriods ?? [],
  );
  const [isLineUp, setIsLineUp] = useState(false);
  const [isAll, setIsAll] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newestFirst = [...periods].reverse();
  const shown = isAll ? newestFirst : newestFirst.slice(0, PERIODS_PREVIEW);
  const open = getOpenPeriod(periods);

  const stop = async () => {
    if (!user || isBusy) return;
    const isConfirmed = await confirm({
      title: TRACKING_WORDS.stopTitle,
      message: TRACKING_WORDS.stopMessage,
      confirmText: TRACKING_WORDS.stopConfirm,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await moveToPlan(user.uid, encryption, today);
    } catch (stopError) {
      setError(
        getErrorMessage(stopError, 'That did not save. Nothing was changed.'),
      );
    } finally {
      setIsBusy(false);
    }
  };

  const choose = (next: Level) => {
    if (next === level) return;
    setError(null);
    if (next === 'track') setIsLineUp(true);
    else void stop();
  };

  if (isLineUp && level === 'plan') {
    return <LineUpScreen onClose={() => setIsLineUp(false)} />;
  }

  return (
    <Subview title={TRACKING_WORDS.title} onClose={onClose}>
      <div className='space-y-4'>
        <div className='border-border bg-card space-y-3 rounded-2xl border p-4'>
          <PillGroup
            label={TRACKING_WORDS.choice}
            options={levelOptions}
            value={level}
            onChange={choose}
          />
          <InlineNotice tone='info'>
            {level === 'track'
              ? TRACKING_WORDS.trackHelp
              : TRACKING_WORDS.planHelp}
          </InlineNotice>
          <LevelGate level='track'>
            {open && (
              <p className='text-sm'>
                Tracking since {formatDateUTC(open.from)}.
              </p>
            )}
          </LevelGate>
          {error && (
            <p className='text-destructive text-sm' role='alert'>
              {error}
            </p>
          )}
        </div>
        {periods.length > 0 && (
          <div className='space-y-2'>
            <h2 className='text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase'>
              {TRACKING_WORDS.history}
            </h2>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {shown.map((period) => (
                <li
                  key={period.from}
                  className='flex items-start justify-between gap-3 p-3 text-sm'
                >
                  <span className='min-w-0'>
                    {formatDateUTC(period.from)}
                    {period.to === null
                      ? ' to now'
                      : ` to ${formatDateUTC(period.to)}`}
                  </span>
                </li>
              ))}
            </ul>
            {periods.length > PERIODS_PREVIEW && (
              <ShowMoreButton
                isOpen={isAll}
                onClick={() => setIsAll((current) => !current)}
              >
                {isAll ? 'Show fewer' : `Show all ${periods.length}`}
              </ShowMoreButton>
            )}
          </div>
        )}
      </div>
    </Subview>
  );
}

export default TrackingScreen;
