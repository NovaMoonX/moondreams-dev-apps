/** Fixed words for a Runway push: a lock screen shows the count of waiting purchases and nothing the person typed or a bank sent. */
export const RUNWAY_PUSH_TITLE = 'Runway';

export const NEEDS_HOME_PATH = '/runway?view=needsHome';

export const needsHomeBody = (count: number) =>
  count === 1 ? '1 purchase needs a home' : `${count} purchases need a home`;
