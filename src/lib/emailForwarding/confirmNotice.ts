import type { EmailConfirm } from '@/lib/emailForwarding/types';

const CONFIRM_NOTICE_DAYS = 7;
const DAY_MS = 86_400_000;

/** Whether this device already tapped the confirm button for this confirmation, kept under the caller's storage key. */
export const readConfirmTapped = (key: string, confirmAt: number | null) => {
  try {
    return (
      confirmAt !== null && localStorage.getItem(key) === String(confirmAt)
    );
  } catch {
    return false;
  }
};

export const writeConfirmTapped = (key: string, confirmAt: number) => {
  try {
    localStorage.setItem(key, String(confirmAt));
  } catch {
    // Storage can be blocked; the notice then stays its seven days.
  }
};

/** Whether a forwarding confirmation is still shown: one the server confirmed until a real email arrives after it, any other for seven days. */
export const isConfirmNoticeDue = (
  confirm: EmailConfirm,
  events: { outcome: string; receivedAt: number }[],
  now: number,
) => {
  if (confirm.autoConfirm === 'confirmed') {
    return !events.some(
      (entry) => entry.outcome !== 'confirm' && entry.receivedAt > confirm.at,
    );
  }
  // A hand-forwarded email proves nothing about automatic forwarding, so only time ends the notice, never a tap.
  return now < confirm.at + CONFIRM_NOTICE_DAYS * DAY_MS;
};
