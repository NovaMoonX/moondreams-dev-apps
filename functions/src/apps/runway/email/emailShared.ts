export const EMAIL_ADDRESS_PREFIX = 'runway';
export const EMAIL_PURCHASES_GATE_ID = 'email-purchases';
export const EMAIL_EVENT_KEEP_DAYS = 30;
export const MAX_EMAILS_PER_HOUR = 30;

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
