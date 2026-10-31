import { APP_REGISTRY_ID_MAP } from '@lib/app';

import type {
  Feedback,
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
