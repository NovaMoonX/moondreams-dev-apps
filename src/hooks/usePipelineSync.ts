import { useEffect, useState } from 'react';

import type { PipelineInbox, PipelineSession } from '@/lib/admin/pipelineTypes';
import {
  startPipelineInboxListener,
  startPipelineSessionsListener,
} from '@/store/listeners/pipelineListeners';

export interface PipelineState {
  sessions: PipelineSession[];
  inbox: PipelineInbox | null;
  isLoading: boolean;
  hasError: boolean;
}

const INITIAL: PipelineState = {
  sessions: [],
  inbox: null,
  isLoading: true,
  hasError: false,
};

/** Live sessions and inbox for the admin dashboard's Pipeline view; a failed listener clears what it loaded. */
export function usePipelineSync(isEnabled: boolean): PipelineState {
  const [state, setState] = useState(INITIAL);

  useEffect(() => {
    if (!isEnabled) return;
    const handleError = (error: Error) => {
      console.error('Pipeline listener failed', error);
      setState({ sessions: [], inbox: null, isLoading: false, hasError: true });
    };
    const stopSessions = startPipelineSessionsListener(
      (sessions) =>
        setState((current) => ({ ...current, sessions, isLoading: false })),
      handleError,
    );
    const stopInbox = startPipelineInboxListener(
      (inbox) => setState((current) => ({ ...current, inbox })),
      handleError,
    );
    return () => {
      stopSessions();
      stopInbox();
    };
  }, [isEnabled]);

  return state;
}
