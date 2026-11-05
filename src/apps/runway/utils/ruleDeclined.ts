const KEY_PREFIX = 'runway-rule-declined';

const keyFor = (uid: string, merchantKey: string) =>
  `${KEY_PREFIX}:${uid}:${merchantKey}`;

/** Whether the person said "Not now" to a rule for this place; kept on this device only, since a plan has no document for small preferences. */
export function isRuleDeclined(uid: string, merchantKey: string): boolean {
  try {
    return localStorage.getItem(keyFor(uid, merchantKey)) === 'true';
  } catch {
    return false;
  }
}

export function declineRule(uid: string, merchantKey: string): void {
  try {
    localStorage.setItem(keyFor(uid, merchantKey), 'true');
  } catch {
    // Storage is unavailable, so the offer simply comes back.
  }
}
