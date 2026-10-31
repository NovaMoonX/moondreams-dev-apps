export type PipelineSessionState = 'working' | 'waiting' | 'idle';

export interface PipelineSession {
  sessionId: string;
  url: string | null;
  branch: string | null;
  state: PipelineSessionState;
  /** The 🚩 lines from the turn's last reply. */
  raisedHands: string[];
  startedAt: number;
  turnStartedAt: number | null;
  updatedAt: number;
}

export interface PipelineOwnerItem {
  text: string;
  options: { label: string; images: string[] }[];
  /** Null or missing on documents written before multi-select questions; read with `=== true`. */
  isMulti: boolean | null;
}

export interface PipelineInboxStatus {
  sessionUrl: string | null;
  sessionTitle: string | null;
  state: string | null;
  ownerItems: PipelineOwnerItem[];
  goodToKnow: string[];
  screenshots: string[];
  updatedAt: number;
}

export interface PipelineGalleryImage {
  src: string;
  role: 'before' | 'after' | null;
}

export interface PipelineGalleryStep {
  label: string;
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

/** When the owner last answered each ask from the dashboard: "<pr>:<index>" for a question, "<pr>:reply" for 🚩 lines. */
export interface PipelineAnswered {
  marks: Record<string, number>;
  updatedAt: number;
}

export interface PipelineInbox {
  prs: PipelineInboxPr[];
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
