import { useCallback } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch, useAppSelector } from '@/store';
import { savePinchSettings } from '@apps/pinch/store/actions/pinchSettingsActions';
import {
  selectPinchSettings,
  selectUsualDays,
} from '@apps/pinch/store/selectors';
import type { PinchSettingsPatch } from '@apps/pinch/utils/settings';

/** The person's settings (the defaults until their first change) and one way to change them. A change shows right away from the local write; a refusal says so in a toast. */
export function usePinchSettings(uid: string) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const settings = useAppSelector(selectPinchSettings);
  const usualDays = useAppSelector(selectUsualDays);

  const save = useCallback(
    async (patch: PinchSettingsPatch) => {
      const result = await dispatch(savePinchSettings({ uid, patch }));
      if (savePinchSettings.rejected.match(result)) {
        addToast({
          title: 'That didn’t save',
          description: result.payload ?? 'Unable to save your settings.',
          type: 'error',
        });
        return false;
      }
      return true;
    },
    [addToast, dispatch, uid],
  );

  return { settings, usualDays, save };
}
