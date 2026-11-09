import type { AppEncryption, EncryptedFieldPayload } from '@lib/security';

/** The views that have a screen so far; each later issue adds its own. */
export type HelmView = 'home' | 'today' | 'inbox';

export type Sealed = EncryptedFieldPayload;

export type HelmEncryption = AppEncryption<'helm'>;

export interface HelmProfile {
  /** IANA zone, set from the device on first open. */
  timeZone: string;
  /** Floating "HH:mm": the earliest a slot may start. */
  dayStartTime: string;
  dayEndTime: string;
  /** Share of free time the planner may fill. */
  planFillPercent: number;
  createdAt: number;
  lastEditedAt: number | null;
}

export type CaptureStatus =
  'received' | 'interpreting' | 'sorted' | 'needsYou' | 'failed';

/** What Helm read in a turn for certain. Empty until the issue that reads something; readers default every field they add. */
export type CaptureReading = Record<string, never>;

/** One turn: what the person said, with the words sealed. */
export interface Capture {
  inputMode: 'typed' | 'voice' | 'attachment';
  medium: 'web';
  sessionId: string;
  turnIndex: number;
  status: CaptureStatus;
  seenAt: number | null;
  createdAt: number;
  sealed: Sealed;
}

export interface CaptureSealed {
  text: string;
  reading: CaptureReading;
}

/** A turn after its words are opened; one that would not open keeps `isUnreadable` and empty words. */
export interface OpenCapture extends Omit<Capture, 'sealed'> {
  id: string;
  text: string;
  reading: CaptureReading;
  isUnreadable: boolean;
}
