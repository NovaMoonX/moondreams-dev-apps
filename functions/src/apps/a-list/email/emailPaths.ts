export const EMAIL_ADDRESS_PREFIX = 'amc';
export const EMAIL_TICKETS_GATE_ID = 'amc-emails';
export const EMAIL_EVENT_KEEP_DAYS = 30;
export const MAX_EMAILS_PER_HOUR = 30;

const membership = (uid: string) => `apps/a-list/memberships/${uid}`;

export const emailTokenPath = (token: string) =>
  `apps/a-list/emailTokens/${token}`;
export const emailRatePath = (uid: string, hour: string) =>
  `apps/a-list/server/${uid}/emailRate/${hour}`;
export const intakePath = (uid: string) =>
  `${membership(uid)}/emailIntake/address`;
export const emailEventsPath = (uid: string) =>
  `${membership(uid)}/emailEvents`;
export const viewingsPath = (uid: string) => `${membership(uid)}/viewings`;
export const watchlistPath = (uid: string) => `${membership(uid)}/watchlist`;
export const membershipPath = membership;
