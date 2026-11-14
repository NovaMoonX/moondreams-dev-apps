import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import SegmentedControl from '@/components/SegmentedControl';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { readNearNow } from '@apps/helm/engine/whereabouts';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  forgetNearNow,
  setPhoneLocation,
} from '@apps/helm/store/actions/settingsActions';
import type { PhoneLocation } from '@apps/helm/types';
import {
  readPosition,
  type PositionFailure,
} from '@apps/helm/utils/phoneLocation';

interface PhoneLocationSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const LEVELS: PhoneLocation[] = ['off', 'city', 'precise'];

const OPTIONS = LEVELS.map((level) => ({
  value: level,
  label: HELM_COPY.phoneLocationLevels[level],
}));

const RANK = { off: 0, city: 1, precise: 2 } as const;

/** This phone's location: Off, City only or Precise, what each keeps, the last place read and Forget. */
function PhoneLocationSheet({ isOpen, onClose }: PhoneLocationSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const profile = useAppSelector((state) => state.helm.profile);
  const nearNow = useAppSelector((state) =>
    readNearNow(
      state.helm.who.items.find((entry) => entry.isSelf && !entry.isUnreadable)
        ?.nearNow ?? null,
      now,
    ),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const setting = profile?.phoneLocation ?? 'off';

  const save = async (next: PhoneLocation) => {
    if (!user) return;
    const result = await setPhoneLocation(
      user.uid,
      await getHelmEncryption(user.uid),
      next,
    );
    if (result === 'offline') {
      setProblem(HELM_COPY.editNeedsConnection);
    } else if (result !== 'saved') {
      setProblem(HELM_COPY.phoneLocationSaveFailed);
    }
  };

  const choose = (next: PhoneLocation) => {
    if (isBusy || next === setting) return;
    setProblem(null);
    setIsBusy(true);
    const ask =
      next !== 'off' && RANK[next] > RANK[setting]
        ? readPosition(next).then(
            () => null,
            (failure: PositionFailure) => failure,
          )
        : Promise.resolve(null);
    void ask
      .then(async (failure) => {
        if (failure) {
          setProblem(
            failure === 'denied'
              ? HELM_COPY.phoneLocationDenied
              : HELM_COPY.phoneLocationFailed,
          );
          return;
        }
        await save(next);
      })
      .catch((error: unknown) => {
        console.error('Helm phone location was not saved', error);
        setProblem(HELM_COPY.phoneLocationSaveFailed);
      })
      .finally(() => setIsBusy(false));
  };

  const forget = async () => {
    if (!user) return;
    try {
      const result = await forgetNearNow(
        user.uid,
        await getHelmEncryption(user.uid),
      );
      addToast({
        title:
          result === 'saved'
            ? HELM_COPY.phoneLocationForgotten
            : HELM_COPY.editNeedsConnection,
        type: 'info',
      });
    } catch (error) {
      console.error('Helm last place was not forgotten', error);
      addToast({ title: HELM_COPY.phoneLocationSaveFailed, type: 'error' });
    }
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.phoneLocationRow}
    >
      <div className='space-y-4'>
        <SegmentedControl
          label={HELM_COPY.phoneLocationRow}
          options={OPTIONS}
          value={setting}
          onChange={choose}
        />
        <p className='text-muted-foreground text-[15px] text-pretty'>
          {HELM_COPY.phoneLocationKeeps[setting]}
        </p>
        {problem && (
          <p className='text-[15px] text-pretty' role='status'>
            {problem}
          </p>
        )}
        {setting !== 'off' && (
          <div className='flex items-center justify-between gap-3'>
            <p className='text-muted-foreground min-w-0 text-[15px]'>
              {nearNow
                ? HELM_COPY.phoneLocationRead(
                    nearNow.city,
                    formatTime(nearNow.at),
                  )
                : HELM_COPY.phoneLocationNone}
            </p>
            {nearNow && (
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                onClick={() => void forget()}
              >
                {HELM_COPY.phoneLocationForget}
              </Button>
            )}
          </div>
        )}
      </div>
    </FormSheet>
  );
}

export default PhoneLocationSheet;
