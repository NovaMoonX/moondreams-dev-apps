export type FeedbackKind = 'bug' | 'idea' | 'question';

/** Where an automatic Claude session has taken a piece of feedback; written only by Functions. */
export type FeedbackAgentState =
  'queued' | 'working' | 'pr-ready' | 'needs-you' | 'held' | 'merged';

export type FeedbackStatus = 'new' | 'looking' | 'planned' | 'done' | 'wont-do';

/** Where the person was when they sent it, gathered automatically and shown to them before sending. */
export interface FeedbackContext {
  /** The app they were in, or null on the site's own screens (Home, account). */
  appId: string | null;
  /** Path of the screen they were on, without the query and with share ids replaced. */
  path: string;
  siteVersion: string;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
}

/** `feedback/{id}`: one bug, idea or question, readable by its sender and the admin. */
export interface Feedback {
  id: string;
  uid: string;
  /** The sender's name and email at the time, for the admin's list; the email may be null. */
  authorName: string | null;
  authorEmail: string | null;
  kind: FeedbackKind;
  text: string;
  status: FeedbackStatus;
  context: FeedbackContext;
  /** Something the sender hasn't seen yet: an admin reply or a status change. */
  isUnreadBySender: boolean;
  /** Something the admin hasn't seen yet: the feedback itself or a reply from the sender. */
  isUnreadByAdmin: boolean;
  createdAt: number;
  /** The last message or status change, which orders both inboxes. */
  lastActivityAt: number;
  /** The group the admin put it in, or null. An item is in at most one group. */
  groupId: string | null;
  /** The last Claude Code session it was sent to; written only by the Function. */
  claudeSessionUrl: string | null;
  /** Where the automatic session stands, or null when none has touched it; written only by Functions. */
  agentState: FeedbackAgentState | null;
  /** When it was queued for an automatic session. */
  agentQueuedAt: number | null;
  /** The draft PR the automatic session opened. */
  agentPrUrl: string | null;
  /** Why it is held, in a sentence. */
  agentNote: string | null;
}

/** `adminSettings/feedbackAutomation`: the admin's switch for Claude working on feedback by itself. */
export interface FeedbackAutomationSettings {
  isOn: boolean;
  updatedAt: number;
}

/** `feedbackGroups/{id}`: an admin-only bucket of related feedback ("Small fixes"). */
export interface FeedbackGroup {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** The last Claude Code session the whole group was sent to; written only by the Function. */
  claudeSessionUrl: string | null;
}

export type FeedbackMessageKind = 'reply' | 'status';

/** `feedback/{feedbackId}/messages/{id}`: a reply from either side, or a status change the admin made. */
export interface FeedbackMessage {
  id: string;
  kind: FeedbackMessageKind;
  fromUid: string;
  isFromAdmin: boolean;
  /** The reply's words; null for a status change. */
  text: string | null;
  /** The new status for a status change; null for a reply. */
  status: FeedbackStatus | null;
  createdAt: number;
}
