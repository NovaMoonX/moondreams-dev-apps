export type FeedbackKind = 'bug' | 'idea' | 'question';

export type FeedbackStatus = 'new' | 'looking' | 'planned' | 'done' | 'wont-do';

/** Where the person was when they sent it, gathered automatically and shown to them before sending. */
export interface FeedbackContext {
  /** The app they were in, or null on the site's own screens (Home, account). */
  appId: string | null;
  /** Path and query of the screen they were on. */
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
