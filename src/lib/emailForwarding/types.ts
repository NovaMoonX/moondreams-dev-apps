/** The providers whose forwarding confirmation the server recognises. */
export type ConfirmProvider = 'gmail' | 'yahoo' | 'proton';

/** What the server did with a confirmation link: opened it, tried and failed, or left it for the person. */
export type AutoConfirm = 'confirmed' | 'failed' | 'skipped';

/** The forwarding address and what the server caught of the provider's confirmation email, written only by Functions. */
export interface EmailIntakeState {
  /** The full private address, e.g. `<prefix>-<token>@moondreamsmail.com`. */
  address: string;
  /** The https link from the provider's forwarding confirmation; null until one arrives. */
  confirmUrl: string | null;
  /** The code from the same email, for a provider that asks for one; null when none was found. */
  confirmCode: string | null;
  /** When the confirmation arrived; null until it does. */
  confirmAt: number | null;
  /** Whether the server opened the confirmation link itself; null until a confirmation arrives. */
  autoConfirm: AutoConfirm | null;
  /** Whose confirmation it was; null until one arrives. */
  confirmProvider: ConfirmProvider | null;
  /** When any email last reached the address; null until one does. */
  lastReceivedAt: number | null;
  /** When an email the provider forwarded on its own (not by hand) last arrived; null until one does, and on an older document. */
  forwardedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** A forwarding confirmation as the confirm notice draws it. */
export interface EmailConfirm {
  url: string | null;
  code: string | null;
  at: number;
  autoConfirm: AutoConfirm | null;
  provider: ConfirmProvider | null;
}
