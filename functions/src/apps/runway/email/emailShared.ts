export const EMAIL_DOMAIN = 'moondreamsmail.com';
export const EMAIL_ADDRESS_PREFIX = 'runway';
export const EMAIL_PURCHASES_GATE_ID = 'email-purchases';
export const EMAIL_EVENT_KEEP_DAYS = 30;

export const emailTokenPath = (token: string) =>
  `apps/runway/emailTokens/${token}`;
export const emailRatePath = (uid: string, hour: string) =>
  `apps/runway/server/${uid}/emailRate/${hour}`;
export const planPath = (uid: string) => `apps/runway/plans/${uid}`;
export const intakePath = (uid: string) =>
  `apps/runway/plans/${uid}/emailIntake/address`;
export const emailEventsPath = (uid: string) =>
  `apps/runway/plans/${uid}/emailEvents`;
export const emailFiltersPath = (uid: string) =>
  `apps/runway/plans/${uid}/emailFilters`;

const ADDRESS = new RegExp(
  `^${EMAIL_ADDRESS_PREFIX}-([a-z0-9_-]{12,32})@${EMAIL_DOMAIN.replace(/\./g, '\\.')}$`,
);

/** The token in a `runway-<token>@moondreamsmail.com` address, or null for any other address. */
export const readAddressToken = (to: string) =>
  ADDRESS.exec(to.trim().toLowerCase())?.[1] ?? null;

/** The bare, lower-cased address in a `Name <address>` header value. */
export const toAddress = (value: string) =>
  (/<([^>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();
