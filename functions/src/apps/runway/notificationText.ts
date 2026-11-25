/** Fixed words for a Runway push: a lock screen shows the count of waiting purchases and nothing the person typed or a bank sent. */
export const RUNWAY_PUSH_TITLE = 'Runway';

export const NEEDS_HOME_PATH = '/runway?view=needsHome';

export const needsHomeBody = (count: number) =>
  count === 1 ? '1 purchase needs a home' : `${count} purchases need a home`;

export const ALERTS_PATH = '/runway';
export const FREE_TO_SPEND_PATH = '/runway?view=freeToSpend';
export const envelopePath = (itemId: string) =>
  `/runway?openEnvelope=${encodeURIComponent(itemId)}`;

/** The one body that carries a word the person typed, and only for an alert they chose to have named; its length is capped for a lock screen. */
export const namedAlertBody = (envelope: string) =>
  `${envelope.trim().slice(0, 40)} dropped below one of your alerts.`;

/** What a lock screen says when alerts go off: never an amount, and Free to Spend's never says the money is low. */
export function alertBody(
  fired: readonly { isFreeToSpend: boolean; envelope: string | null }[],
): string {
  const [only] = fired;
  const count = fired.length;
  if (count !== 1) return `${count} of your alerts went off.`;
  if (only.isFreeToSpend) return 'One of your alerts went off.';
  return only.envelope === null
    ? 'An envelope dropped below one of your alerts.'
    : namedAlertBody(only.envelope);
}

/** Where a tap lands: one alert opens what it watches, several open Home. */
export function alertPath(
  fired: readonly { isFreeToSpend: boolean; itemId: string | null }[],
): string {
  const [only] = fired;
  if (fired.length !== 1) return ALERTS_PATH;
  if (only.isFreeToSpend || only.itemId === null) return FREE_TO_SPEND_PATH;
  return envelopePath(only.itemId);
}
