import type { EmailFilterSealed, EmailOutcome } from '@apps/runway/types';

export const EMAIL_FILTER_TEXT =
  'from:(alerts@yourbank.com) subject:(purchase OR charge OR transaction OR spent OR alert)';
export const GMAIL_FILTERS_URL =
  'https://mail.google.com/mail/u/0/#settings/filters';
export const GMAIL_FORWARDING_URL =
  'https://mail.google.com/mail/u/0/#settings/fwdandpop';

export const EMAIL_WORDS = {
  rowLabel: 'Purchases from email',
  rowNotSetUp: 'Not set up yet',
  rowSetUp: 'Each alert becomes a purchase',
  rowAction: 'Forward your bank’s alerts',
  title: 'Purchases from email',
  addressCaption: 'Your address',
  getAddress: 'Get your address',
  newAddress: 'Get a new address',
  newAddressSub: 'Your old address stops working',
  newAddressTitle: 'Get a new address?',
  newAddressMessage:
    'Your old address stops working. Anything still forwarding to it will be lost.',
  addressFailed: 'The address did not change. Try again in a moment.',
  stepsCaption: 'How to set it up',
  steps: [
    'Copy the address.',
    'In Gmail, add it as a forwarding address, then come back to confirm.',
    'Make a filter for your bank’s alert address, so only its alerts come here.',
  ],
  filterHint: 'Swap in the address your bank’s alerts come from.',
  filterLabel: 'Copy filter text',
  gmailForwarding: 'Open Gmail forwarding',
  gmailFilters: 'Open Gmail filters',
  confirmForwarding: 'Confirm forwarding',
  confirmCode: 'Code',
  filtersCaption: 'Filtered out',
  filterTitle: 'Filter',
  removeFilter: 'Remove this filter',
  removeFilterSub: 'Emails like this will be read again.',
  eventsCaption: 'Recent emails',
  noEvents: 'Nothing has reached your address yet.',
  emailTitle: 'Email',
  filterOut: 'Filter out emails like this',
  filterOutSub: 'Future ones are skipped before anything is read.',
  filterOutRowSub: 'Emails like this won’t become purchases',
  unreadLine:
    'Runway couldn’t find an amount and a place in this email. If it was a purchase, add it from Add a purchase.',
  notPurchaseLine:
    'This looked like a payment, refund or notice, not a purchase.',
  noSubject: 'No subject',
  from: 'From',
  readOnPattern: 'Read from a known layout',
  readByAi: 'Read by AI',
  fromSender: 'From this sender',
  withSubject: 'With this subject',
  suggestionsCaption: 'Suggestions',
  saveFilter: 'Save filter',
  pickOne: 'Pick at least one',
  saveFailed: 'The filter did not save. Try again.',
  removeFailed: 'That did not go through. Try again.',
  waitingShort: 'Waiting for your bank',
  drawerWaiting:
    'Read from your bank’s alert email. It merges on its own when your bank sends the same charge.',
  drawerFromEmail: 'Read from your bank’s alert email.',
  stopWaiting: 'Stop waiting for your bank',
  overdueNotice: (days: number) =>
    `Your bank hasn’t sent this charge in ${days} days. Stop waiting to keep it as it is, or remove it.`,
  stoppedWaiting: 'No longer waiting for your bank',
  undo: 'Undo',
  stopWaitingSub: 'Keep it as typed; your bank’s charge won’t merge with it.',
  homeCount: (count: number) =>
    count === 1 ? '1 purchase from email' : `${count} purchases from email`,
  homeSub: 'Not from your bank yet',
  homeSentence: (count: number) =>
    count === 1
      ? '1 purchase from email hasn’t shown up from your bank'
      : `${count} purchases from email haven’t shown up from your bank`,
  overdueTitle: 'Not from your bank yet',
  overdueSub: 'Open one to remove it or stop waiting for it.',
} as const;

const OUTCOME_WORDS: Record<EmailOutcome, string> = {
  purchase: 'Added as a purchase',
  notPurchase: 'Not a purchase',
  filtered: 'Filtered out',
  confirm: 'Gmail confirmation',
  unread: 'Couldn’t read it',
  notTracking: 'Not tracking that day',
};

export const describeEmailOutcome = (outcome: EmailOutcome) =>
  OUTCOME_WORDS[outcome];

/** A subject's shape as the person reads it: its placeholders said in words. */
export const readSubjectTemplate = (template: string) =>
  template
    .replaceAll('{amount}', 'any amount')
    .replaceAll('{date}', 'any date')
    .replaceAll('{n}', 'any number');

/** A filter as a name and one more line, in the person's words. */
export function describeEmailFilter(filter: EmailFilterSealed): {
  name: string;
  detail: string | null;
} {
  const parts = [
    ...(filter.fromAddress ? [`From ${filter.fromAddress}`] : []),
    ...(filter.subjectTemplate
      ? [`Subject like “${readSubjectTemplate(filter.subjectTemplate)}”`]
      : []),
    ...filter.subjectContains.map((text) => `Subject has “${text}”`),
    ...filter.bodyContains.map((text) => `Email says “${text}”`),
  ];
  return {
    name: parts[0] ?? 'Empty filter',
    detail: parts.length > 1 ? parts.slice(1).join(' · ') : null,
  };
}
