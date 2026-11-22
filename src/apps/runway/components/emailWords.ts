import type { EmailFilterSealed, EmailOutcome } from '@apps/runway/types';

export const EMAIL_FILTER_TEXT =
  'subject:(purchase OR charge OR transaction OR spent OR alert)';
export const GMAIL_FILTERS_URL =
  'https://mail.google.com/mail/u/0/#settings/filters';

export const EMAIL_WORDS = {
  rowLabel: 'Purchases from email',
  rowNotSetUp: 'Not set up yet',
  rowSetUp: 'Bank alerts become purchases',
  title: 'Email purchases',
  addressCaption: 'Your address',
  getAddress: 'Get your address',
  newAddress: 'Get a new address',
  newAddressTitle: 'Get a new address?',
  newAddressMessage:
    'Your old address stops working. Anything still forwarding to it will be lost.',
  addressFailed: 'The address did not change. Try again in a moment.',
  stepsCaption: 'How to set it up',
  steps: [
    'Copy the address.',
    'In Gmail, add it as a forwarding address, then come back to confirm.',
    'Make a filter that forwards your bank’s alerts.',
  ],
  filterLabel: 'Copy filter text',
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
  waitingLine: 'From your email · waiting for your bank',
  drawerWaiting:
    'Read from your bank’s alert email. It merges on its own when your bank sends the same charge.',
  drawerFromEmail: 'Read from your bank’s alert email.',
  stopWaiting: 'Stop waiting for it',
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

/** A filter as a name and one more line, in the person's words. */
export function describeEmailFilter(filter: EmailFilterSealed): {
  name: string;
  detail: string | null;
} {
  const parts = [
    ...(filter.fromAddress ? [`From ${filter.fromAddress}`] : []),
    ...(filter.subjectTemplate
      ? [`Subject like “${filter.subjectTemplate}”`]
      : []),
    ...filter.subjectContains.map((text) => `Subject has “${text}”`),
    ...filter.bodyContains.map((text) => `Email says “${text}”`),
  ];
  return {
    name: parts[0] ?? 'Empty filter',
    detail: parts.length > 1 ? parts.slice(1).join(' · ') : null,
  };
}
