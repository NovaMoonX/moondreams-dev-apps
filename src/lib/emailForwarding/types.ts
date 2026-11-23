/** The email services a forwarding walkthrough knows how to set up; `other` gets generic steps. */
export type EmailProvider =
  'gmail' | 'outlook' | 'icloud' | 'yahoo' | 'proton' | 'other';

export type EmailSetupStepId =
  'provider' | 'copy' | 'forwarding' | 'rule' | 'confirm' | 'filter' | 'test';

/** How far the person got setting up forwarding, written by the app so the walkthrough resumes on any device; one per person per app, at `emailSetup/progress`. */
export interface EmailSetupProgress {
  id: 'progress';
  provider: EmailProvider | null;
  /** The furthest step reached, by id so a provider's list can change without moving it; null before a provider is chosen. */
  stepId: EmailSetupStepId | null;
  /** When the current walk began; a re-walk ticks only what arrives after it. */
  startedAt: number | null;
  /** When setup was finished (the first useful email arrived, or the person completed it); null while unfinished. */
  doneAt: number | null;
  /** The newest email change the app has told the person about (an email's `receivedAt`, a server time); null until one has been seen. Documents written before it lack the key. */
  noticeSeenThrough: number | null;
  createdAt: number;
  updatedAt: number;
}

/** The forwarding address and what the server caught of the provider's confirmation email, written only by Functions. */
export interface EmailIntakeState {
  /** The full private address, e.g. `<prefix>+<token>@apps.moondreams.dev`. */
  address: string;
  /** The https link from the provider's forwarding confirmation; null until one arrives. */
  confirmUrl: string | null;
  /** The code from the same email, for a provider that asks for one; null when none was found. */
  confirmCode: string | null;
  /** When the confirmation arrived; null until it does. */
  confirmAt: number | null;
  /** When any email last reached the address; null until one does. */
  lastReceivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
