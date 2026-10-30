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

export interface PipelineInbox {
  prs: PipelineInboxPr[];
  updatedAt: number;
}
