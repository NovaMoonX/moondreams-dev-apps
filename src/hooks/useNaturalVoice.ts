import { useEffect, useState, useSyncExternalStore } from 'react';

import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import {
  getNaturalVoiceHost,
  NATURAL_VOICE_SIZE_MB,
} from '@/lib/speech/naturalVoice/config';
import {
  enableNaturalVoice,
  getNaturalVoiceState,
  isNaturalVoiceSupported,
  removeNaturalVoice,
  subscribeNaturalVoice,
  unloadNaturalVoice,
  warmNaturalVoice,
} from '@/lib/speech/naturalVoice/naturalVoiceEngine';

/**
 * The opt-in for a more natural reading voice that runs on the device. `storageKey` is where this person's choice is
 * remembered on this browser (off to start). Turning it on downloads about `sizeMb` megabytes once from `host`, keeps
 * them in the browser and starts the voice; turning it off frees it but keeps the download, `remove` deletes it. While it
 * is not `isReady`, readings use the browser's voice, so the choice never blocks speech. Pass `isOn` to
 * `useSpeechCommands` as `isNaturalVoice`. Secure pages with WebAssembly only (`isSupported`); draw nothing where it is false.
 */
export function useNaturalVoice(storageKey: string) {
  const [isChosen, setIsChosen] = useLocalStoragePreference(storageKey, false);
  const [isSupported] = useState(isNaturalVoiceSupported);
  const state = useSyncExternalStore(
    subscribeNaturalVoice,
    getNaturalVoiceState,
  );

  useEffect(() => {
    if (!isSupported || !isChosen) return;
    warmNaturalVoice().catch((error: unknown) =>
      console.error('The natural voice could not be readied', error),
    );
  }, [isSupported, isChosen]);

  const isOn = isSupported && isChosen && state.isStored !== false;

  const turnOn = () => {
    setIsChosen(true);
    enableNaturalVoice().catch((error: unknown) =>
      console.error('The natural voice could not be turned on', error),
    );
  };

  const turnOff = () => {
    setIsChosen(false);
    unloadNaturalVoice();
  };

  const remove = () => {
    setIsChosen(false);
    removeNaturalVoice().catch((error: unknown) =>
      console.error('The natural voice could not be removed', error),
    );
  };

  return {
    isSupported,
    /** The person wants it and it is on this device (or not looked at yet). */
    isOn,
    isReady: isOn && state.status === 'ready',
    status: state.status,
    /** 0 to 1 while downloading. */
    progress: state.progress,
    problem: state.problem,
    isStored: state.isStored === true,
    sizeMb: NATURAL_VOICE_SIZE_MB,
    host: getNaturalVoiceHost(),
    turnOn,
    turnOff,
    remove,
  };
}

export type NaturalVoice = ReturnType<typeof useNaturalVoice>;
