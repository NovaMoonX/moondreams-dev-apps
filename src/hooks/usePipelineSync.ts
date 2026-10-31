import { useEffect, useState } from 'react';

import type { PipelineInbox, PipelineSession } from '@/lib/admin/pipelineTypes';
import {
  startPipelineAnsweredListener,
  startPipelineInboxListener,
  startPipelineSessionsListener,
} from '@/store/listeners/pipelineListeners';

export interface PipelineState {
  sessions: PipelineSession[];
  inbox: PipelineInbox | null;
  /** When each ask was last answered from the dashboard; empty when unknown, so asks stay shown. */
  answered: Record<string, number>;
  isLoading: boolean;
  /** Which part is failing right now; a later good snapshot clears it. */
  sessionsFailed: boolean;
  inboxFailed: boolean;
  hasError: boolean;
}

interface RawState {
  sessions: PipelineSession[];
  inbox: PipelineInbox | null;
  answered: Record<string, number>;
  sessionsLoaded: boolean;
  answeredLoaded: boolean;
  inboxLoaded: boolean;
  sessionsFailed: boolean;
  inboxFailed: boolean;
}

const INITIAL: RawState = {
  sessions: [],
  inbox: null,
  answered: {},
  sessionsLoaded: false,
  answeredLoaded: false,
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
    const stopAnswered = startPipelineAnsweredListener(
      (answered) =>
        setState((current) => ({
          ...current,
          answered: answered?.marks ?? {},
          answeredLoaded: true,
        })),
      (error) => {
        console.error('Pipeline answered listener failed', error);
        setState((current) => ({
          ...current,
          answered: {},
          answeredLoaded: true,
        }));
      },
    );
    return () => {
      stopSessions();
      stopInbox();
      stopAnswered();
    };
  }, [isEnabled]);

  return {
    sessions: state.sessions,
    inbox: state.inbox,
    answered: state.answered,
    sessionsFailed: state.sessionsFailed,
    inboxFailed: state.inboxFailed,
    isLoading:
      !state.sessionsLoaded || !state.inboxLoaded || !state.answeredLoaded,
    hasError: state.sessionsFailed || state.inboxFailed,
  };
}
