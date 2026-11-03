import { useRef, useState } from 'react';

import type { StatusResult } from '@apps/going-once/store/actions/statusActions';

/** One status write for a view of the thing's drawer: a second tap while it runs is ignored, and a refusal is kept for the view to show. A write that succeeds stays busy, since the view is about to give way. */
export function useStatusWrite() {
  const [isBusy, setIsBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const isInFlightRef = useRef(false);

  const write = async (
    attempt: () => Promise<StatusResult>,
  ): Promise<boolean> => {
    if (isInFlightRef.current) return false;
    isInFlightRef.current = true;
    setIsBusy(true);
    setRefusal(null);
    try {
      const result = await attempt();
      if (result.ok) return true;
      setIsBusy(false);
      setRefusal(result.message);
      return false;
    } catch (error) {
      setIsBusy(false);
      throw error;
    } finally {
      isInFlightRef.current = false;
    }
  };

  return { isBusy, refusal, write };
}
