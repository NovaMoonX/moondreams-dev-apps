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
  /** Which part is failing right now; a later good snapshot clears it. */
  sessionsFailed: boolean;
  inboxFailed: boolean;
  hasError: boolean;
}

interface RawState {
  sessions: PipelineSession[];
  inbox: PipelineInbox | null;
  sessionsLoaded: boolean;
  inboxLoaded: boolean;
  sessionsFailed: boolean;
  inboxFailed: boolean;
}

const INITIAL: RawState = {
  sessions: [],
  inbox: null,
  sessionsLoaded: false,
  inboxLoaded: false,
  sessionsFailed: false,
  inboxFailed: false,
};

/** Live sessions and inbox for the admin dashboard's Pipeline view; a failed listener clears only what it loaded. */
export function usePipelineSync(isEnabled: boolean): PipelineState {
  const [state, setState] = useState(INITIAL);

  useEffect(() => {
    if (!isEnabled) return;
    const stopSessions = startPipelineSessionsListener(
      (sessions) =>
        setState((current) => ({
          ...current,
          sessions,
          sessionsLoaded: true,
          sessionsFailed: false,
        })),
      (error) => {
        console.error('Pipeline sessions listener failed', error);
        setState((current) => ({
          ...current,
          sessions: [],
          sessionsLoaded: true,
          sessionsFailed: true,
        }));
      },
    );
    const stopInbox = startPipelineInboxListener(
      (inbox) =>
        setState((current) => ({
          ...current,
          inbox,
          inboxLoaded: true,
          inboxFailed: false,
        })),
      (error) => {
        console.error('Pipeline inbox listener failed', error);
        setState((current) => ({
          ...current,
          inbox: null,
          inboxLoaded: true,
          inboxFailed: true,
        }));
      },
    );
    return () => {
      stopSessions();
      stopInbox();
    };
  }, [isEnabled]);

  return {
    sessions: state.sessions,
    inbox: state.inbox,
    sessionsFailed: state.sessionsFailed,
    inboxFailed: state.inboxFailed,
    isLoading: !state.sessionsLoaded || !state.inboxLoaded,
    hasError: state.sessionsFailed || state.inboxFailed,
  };
}
