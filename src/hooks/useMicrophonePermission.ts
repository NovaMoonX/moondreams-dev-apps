import { useSyncExternalStore } from 'react';

import {
  peekMicrophonePermission,
  watchMicrophonePermission,
} from '@/lib/speech/microphonePermission';

/** The browser's current microphone permission for this site, re-rendering when it changes; 'unknown' where it cannot tell. Never asks. */
export const useMicrophonePermission = () =>
  useSyncExternalStore(watchMicrophonePermission, peekMicrophonePermission);
