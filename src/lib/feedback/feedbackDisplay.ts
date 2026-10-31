import { APP_REGISTRY_ID_MAP } from '@lib/app';

import type {
  Feedback,
  FeedbackAgentState,
  FeedbackContext,
  FeedbackKind,
  FeedbackStatus,
} from './types';

export const KIND_OPTIONS: {
  value: FeedbackKind;
  label: string;
  emoji: string;
}[] = [
  { value: 'bug', label: 'Bug', emoji: '🐛' },
  { value: 'idea', label: 'Idea', emoji: '💡' },
  { value: 'question', label: 'Question', emoji: '❓' },
];

export const KIND_EMOJI: Record<FeedbackKind, string> = {
  bug: '🐛',
  idea: '💡',
  question: '❓',
};

export const KIND_LABEL: Record<FeedbackKind, string> = {
  bug: 'Bug',
  idea: 'Idea',
  question: 'Question',
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'New',
  looking: 'Looking into it',
  planned: 'Planned',
  done: 'Done',
  'wont-do': "Won't do",
};

export const STATUS_OPTIONS = (
  Object.keys(STATUS_LABEL) as FeedbackStatus[]
).map((value) => ({ value, label: STATUS_LABEL[value] }));

export const STATUS_EVENT_TEXT: Record<FeedbackStatus, string> = {
  new: 'Reopened',
  looking: 'Marked as looking into it',
  planned: 'Marked as planned',
  done: 'Marked as done',
  'wont-do': "Marked as won't do",
};

export const getFirstLine = (text: string) =>
  text
    .split('\n')
    .find((line) => line.trim().length > 0)
    ?.trim() ?? '';

export const sortByActivity = (items: Feedback[]) =>
  [...items].sort((a, b) => b.lastActivityAt - a.lastActivityAt);

const SITE_SCREENS: [string, string][] = [
  ['/inbox', 'Inbox'],
  ['/account', 'Your account'],
  ['/admin', 'Admin'],
];

/** The app, or the site screen, the feedback was sent from. */
export function getContextPlaceName(context: FeedbackContext) {
  const app = context.appId ? APP_REGISTRY_ID_MAP[context.appId] : undefined;
  if (app) return app.name;
  if (context.path === '/' || context.path.startsWith('/?')) return 'Home';
  return (
    SITE_SCREENS.find(([prefix]) => context.path.startsWith(prefix))?.[1] ??
    'The site'
  );
}

/** The agent's state in the list's words. Queued, merged and no state say nothing there: Done already shows. */
export const AGENT_STATE_LABEL: Record<FeedbackAgentState, string> = {
  queued: 'Queued for Claude',
  starting: 'Starting a session',
  working: 'Claude is on it',
  'pr-ready': 'PR ready',
  'needs-you': 'Needs you',
  held: 'Waiting for you',
  merged: 'PR merged',
};

const AGENT_URGENCY: FeedbackAgentState[] = [
  'needs-you',
  'held',
  'pr-ready',
  'starting',
  'working',
  'queued',
  'merged',
];

export interface AgentSummary {
  state: FeedbackAgentState;
  note: string | null;
  sessionUrl: string | null;
  prUrl: string | null;
}

/** One session's state across the items that share it (a group), the one that waits longest on the admin first; null when fewer than two items share a session. */
export function getSharedAgentSummary(items: Feedback[]): AgentSummary | null {
  const agentItems = items.filter(
    (item) => item.agentState !== null && item.claudeSessionUrl !== null,
  );
  const sessions = new Set(agentItems.map((item) => item.claudeSessionUrl));
  if (agentItems.length < 2 || sessions.size !== 1) return null;
  const [lead] = [...agentItems].sort(
    (a, b) =>
      AGENT_URGENCY.indexOf(a.agentState as FeedbackAgentState) -
      AGENT_URGENCY.indexOf(b.agentState as FeedbackAgentState),
  );
  return {
    state: lead.agentState as FeedbackAgentState,
    note: lead.agentNote,
    sessionUrl: lead.claudeSessionUrl,
    prUrl: agentItems.find((item) => item.agentPrUrl)?.agentPrUrl ?? null,
  };
}
