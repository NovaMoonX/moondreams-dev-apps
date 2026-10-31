export type PipelineSessionState = 'working' | 'waiting' | 'idle';

export interface PipelineSession {
  sessionId: string;
  url: string | null;
  branch: string | null;
  state: PipelineSessionState;
  /** The 🚩 lines from the turn's last reply. */
  raisedHands: string[];
  /** What it was last doing; missing on documents from older hooks, so read it with `?? null`. */
  phase: PipelinePhase | null;
  /** The helper agents still running (their agent types); a turn that ended with helpers out stays `working`. Read with `?? []`. */
  helpers: string[];
  startedAt: number;
  turnStartedAt: number | null;
  updatedAt: number;
}

export interface PipelineOwnerItem {
  text: string;
  options: { label: string; images: string[] }[];
  /** Null or missing on documents written before multi-select questions; read with `=== true`. */
  isMulti: boolean | null;
  /** A step to tick off rather than a question; null or missing on documents written before to-dos, read with `=== true`. */
  isTask: boolean | null;
  /** Ticked from the dashboard, read from its line's `(owner: …)` note; null or missing while it waits. */
  settled: PipelineSettleOutcome | null;
}

export interface PipelineInboxStatus {
  sessionUrl: string | null;
  sessionTitle: string | null;
  state: string | null;
  ownerItems: PipelineOwnerItem[];
  /** The open boxes under "Must do before merge"; null or missing on documents written before it was read. */
  mustDo: string[] | null;
  goodToKnow: string[];
  /** The calls a session made for the owner; null on documents written before they were read, so read it with `?? []`. */
  decisions: string[] | null;
  /** Work the session suggests the owner might want next; null on older documents, read with `?? []`. */
  followUps: string[] | null;
  screenshots: string[];
  updatedAt: number;
}

export interface PipelineGalleryImage {
  src: string;
  role: 'before' | 'after' | null;
}

export interface PipelineGalleryStep {
  label: string;
  /** A line under the title; missing on documents written before notes, so read it with `?? null`. */
  note: string | null;
  images: PipelineGalleryImage[];
}

export interface PipelineInboxPr {
  number: number;
  title: string;
  url: string;
  head: string;
  base: string;
  isDraft: boolean;
  labels: string[];
  ci: 'green' | 'red' | 'running' | 'none';
  bodySessionUrl: string | null;
  status: PipelineInboxStatus | null;
  gallery: PipelineGalleryStep[] | null;
}

/** When the owner last answered each ask from the dashboard: "<pr>:<index>" for a question, "<pr>:reply" for 🚩 lines, "<pr>:decisions" for the calls made for the owner, "<pr>:followups" for the possible follow-ups. */
export interface PipelineAnswered {
  marks: Record<string, number>;
  updatedAt: number;
}

/** A pull request merged in the last two weeks: what its session raised before the merge stops waiting. */
export interface PipelineMergedPr {
  number: number;
  sessionUrl: string | null;
  mergedAt: number;
  /** The fields below are missing on documents written before merged PRs kept their lists; read them as null. */
  title: string | null;
  /** When its status comment last changed. */
  statusAt: number | null;
  decisions: string[] | null;
  followUps: string[] | null;
}

export interface PipelineInbox {
  prs: PipelineInboxPr[];
  /** Null or missing on documents written before merges were reported. */
  merged: PipelineMergedPr[] | null;
  updatedAt: number;
}

export type PipelineSettleOutcome = 'done' | 'skipped';

/** An ask the owner ticked off or set aside from the dashboard. */
export interface PipelineSettledAsk {
  /** The pull request whose status comment lists it, or null for a 🚩 line a session raised in chat. */
  prNumber: number | null;
  sessionId: string | null;
  /** The ask's words exactly as the dashboard showed them. */
  text: string;
  outcome: PipelineSettleOutcome;
  at: number;
}

export interface PipelineSettled {
  asks: PipelineSettledAsk[];
  updatedAt: number;
}

export const PIPELINE_PHASES = [
  'planning',
  'building',
  'investigating',
  'screenshots',
  'review',
  'checks',
  'conversation',
] as const;

export type PipelinePhase = (typeof PIPELINE_PHASES)[number];

/** One day's tokens for one model and phase in one session; `day` is a UTC `YYYY-MM-DD`. */
export interface PipelineCostRow {
  day: string;
  model: string;
  phase: PipelinePhase;
  /** True for a helper's tokens, false for the session's own conversation. */
  isHelper: boolean;
  calls: number;
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

/** A session's whole token use so far, rewritten in full on every turn's end. */
export interface PipelineSessionCost {
  sessionId: string;
  url: string | null;
  branch: string | null;
  /** The app most of the session's edits were in, or null for the site and the pipeline. */
  app: string | null;
  /** Tokens the last main-thread call read: what each further call re-reads. */
  contextTokens: number;
  /** Main-thread calls, without helpers. */
  calls: number;
  rows: PipelineCostRow[];
  startedAt: number;
  updatedAt: number;
}
