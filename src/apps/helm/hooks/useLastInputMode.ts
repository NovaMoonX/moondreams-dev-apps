import { useCallback } from 'react';

import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import type { InputMode } from '@apps/helm/store/screenSlice';

const DEFAULT_MODE: InputMode = 'typed';

const parseMode = (stored: unknown): InputMode | null =>
  stored === 'voice' || stored === 'typed' ? stored : null;

/** How this person last spoke to the assistant on this device; typed until a turn says otherwise, so a first tap never asks for the microphone. */
export function useLastInputMode(uid: string | null) {
  const [mode, setMode] = useLocalStorageState<InputMode>(
    `helmInputMode:${uid ?? 'none'}`,
    DEFAULT_MODE,
    parseMode,
  );
  const setLastMode = useCallback(
    (next: InputMode) => {
      if (uid) setMode(next);
    },
    [uid, setMode],
  );
  return [mode, setLastMode] as const;
}
