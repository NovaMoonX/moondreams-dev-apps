import { useEffect, useSyncExternalStore } from 'react';

import { useCanSeeDebugDetails } from '@lib/debugProfiles/useCanSeeDebugDetails';
import {
  readTurnLog,
  setTurnLogRecording,
  subscribeTurnLog,
} from '@/lib/speech/turnLog';

/** The conversation log's events, oldest first, updating as they are recorded. */
export const useTurnLog = () =>
  useSyncExternalStore(subscribeTurnLog, readTurnLog);

/** Records the conversation log while this screen shows, only for viewers who can see debug details; returns whether they can. */
export function useTurnLogRecording() {
  const canSee = useCanSeeDebugDetails();
  useEffect(() => {
    setTurnLogRecording(canSee);
    return () => setTurnLogRecording(false);
  }, [canSee]);
  return canSee;
}
