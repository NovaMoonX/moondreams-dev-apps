import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HOME_PIN_WORDS, HOME_TILE_COUNT } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  moveHomePin,
  setHomePin,
} from '@apps/runway/store/actions/planActions';
import {
  selectEnvelopes,
  selectHomePins,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly } from '@apps/runway/types';

/** The envelopes pinned to Home and the writes that pin, unpin and reorder them, each saved in the background with a toast when it fails. */
export function useHomePins(today: DateOnly) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const pins = useAppSelector((state) => selectHomePins(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const liveIds = envelopes.map(({ item }) => item.id);
  const isFull = pins.length >= HOME_TILE_COUNT;

  const failed = (error: unknown) =>
    addToast({
      title:
        error instanceof Error && error.message === HOME_PIN_WORDS.full
          ? HOME_PIN_WORDS.full
          : HOME_PIN_WORDS.failed,
      type: 'error',
    });

  const setPin = async (itemId: string, name: string, isPinned: boolean) => {
    if (!user) return;
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await setHomePin(user.uid, encryption, itemId, isPinned, liveIds);
      addToast({
        title: isPinned
          ? HOME_PIN_WORDS.pinnedToast(name)
          : HOME_PIN_WORDS.unpinnedToast(name),
        type: 'success',
      });
    } catch (error) {
      failed(error);
    }
  };

  const move = async (itemId: string, step: -1 | 1) => {
    if (!user) return;
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await moveHomePin(user.uid, encryption, itemId, step, liveIds);
    } catch (error) {
      failed(error);
    }
  };

  return { pins, isFull, setPin, move };
}
