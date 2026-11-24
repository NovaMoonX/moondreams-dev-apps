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

/** Whether a forwarding confirmation is still shown: none once the provider has forwarded an email on its own since, else one the server confirmed until a real email arrives after it, any other for seven days. */
export const isConfirmNoticeDue = (
  confirm: EmailConfirm,
  events: { outcome: string; receivedAt: number }[],
  now: number,
  forwardedAt: number | null,
) => {
  // The provider never says the person confirmed; only an email it forwarded on its own shows the rule is live.
  if (forwardedAt !== null && forwardedAt > confirm.at) return false;
  if (confirm.autoConfirm === 'confirmed') {
    return !events.some(
      (entry) => entry.outcome !== 'confirm' && entry.receivedAt > confirm.at,
    );
  }
  // A tap can't tell whether the person finished in their email, so it never ends the notice.
  return now < confirm.at + CONFIRM_NOTICE_DAYS * DAY_MS;
};
