import { hasConfirmNotice } from '@/lib/emailForwarding/address';
import type { EmailConfirm } from '@/lib/emailForwarding/types';

/** Where forwarding stands, live from the app's listener. */
export interface EmailForwardingState {
  /** The confirmation still worth showing, or null once it is settled or none came. */
  confirm: EmailConfirm | null;
  /** When the newest confirmation arrived, shown or not, so its own email never counts as the first one. */
  confirmAt: number | null;
  isTapped: boolean;
  onConfirmTapped: () => void;
  lastReceivedAt: number | null;
}

export type SetupStepKey = 'copy' | 'forward' | 'confirm' | 'first';
export type StepState = 'done' | 'skipped' | 'current' | 'later';

export interface SetupProgress {
  /** The step the footer acts on, or null once everything is done. */
  current: SetupStepKey | null;
  states: Record<SetupStepKey, StepState>;
  /** A confirmation still waiting on the person, with its link or code. */
  pendingConfirm: EmailConfirm | null;
  shownConfirm: EmailConfirm | null;
  /** Forwarding is proven by an email the app received, not only the person's word. */
  isForwardSeen: boolean;
  isConfirmSkipShown: boolean;
  isAllSet: boolean;
}

interface ProgressInput {
  forwarding: EmailForwardingState;
  isCopied: boolean;
  isForwardSaid: boolean;
  isConfirmSkipped: boolean;
}

const STEP_ORDER: readonly SetupStepKey[] = [
  'copy',
  'forward',
  'confirm',
  'first',
];

/** Which of the four steps are done, from what the app has seen and what the person said; a later confirmation outranks a skip. */
export function readSetupProgress({
  forwarding,
  isCopied,
  isForwardSaid,
  isConfirmSkipped,
}: ProgressInput): SetupProgress {
  const { confirm, confirmAt, lastReceivedAt } = forwarding;
  const shownConfirm =
    confirm !== null && hasConfirmNotice(confirm) ? confirm : null;
  const pendingConfirm =
    shownConfirm !== null && shownConfirm.autoConfirm !== 'confirmed'
      ? shownConfirm
      : null;
  const hasFirstEmail =
    lastReceivedAt !== null &&
    (confirmAt === null || lastReceivedAt > confirmAt);
  const isForwardSeen = confirmAt !== null || lastReceivedAt !== null;
  const isForwarding = isForwardSeen || isForwardSaid;
  const isConfirmSettled =
    shownConfirm === null
      ? hasFirstEmail || isConfirmSkipped || confirmAt !== null
      : pendingConfirm === null;
  const isAllSet = hasFirstEmail && pendingConfirm === null;
  const done: Record<SetupStepKey, boolean> = {
    copy: isCopied || isForwarding,
    forward: isForwarding,
    confirm: isConfirmSettled,
    first: isAllSet,
  };
  const current = STEP_ORDER.find((key) => !done[key]) ?? null;
  const isConfirmSkipShown =
    isConfirmSkipped && shownConfirm === null && !isForwardSeen;
  const states = Object.fromEntries(
    STEP_ORDER.map((key) => {
      if (key === 'confirm' && isConfirmSkipShown) return [key, 'skipped'];
      if (done[key]) return [key, 'done'];
      return [key, key === current ? 'current' : 'later'];
    }),
  ) as Record<SetupStepKey, StepState>;
  return {
    current,
    states,
    pendingConfirm,
    shownConfirm,
    isForwardSeen,
    isConfirmSkipShown,
    isAllSet,
  };
}
