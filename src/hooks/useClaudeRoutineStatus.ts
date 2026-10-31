import { useEffect, useState } from 'react';

import { startClaudeRoutineStatusListener } from '@/store/listeners/feedbackListeners';

/** Whether a Claude routine is connected, without reading its token; null until known. Admin only. */
export function useClaudeRoutineStatus(isEnabled: boolean): {
  isConnected: boolean | null;
} {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isEnabled) return;
    return startClaudeRoutineStatusListener(setIsConnected, (error) => {
      console.error('Failed to load the Claude connection:', error);
      setIsConnected(null);
    });
  }, [isEnabled]);

  return { isConnected: isEnabled ? isConnected : null };
}
