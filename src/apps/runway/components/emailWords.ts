import type {
  EmailFilterSealed,
  EmailOutcome,
  EmailProvider,
} from '@apps/runway/types';

export const buildGmailFilterText = (address: string) =>
  `from:(${address}) subject:(purchase OR charge OR transaction OR spent OR alert)`;
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
  getAddress: 'Get your address',
  newAddress: 'Get a new address',
  newAddressSub: 'Your old address stops working',
  newAddressTitle: 'Get a new address?',
  newAddressMessage:
    'Your old address stops working. Anything still forwarding to it will be lost.',
  addressFailed: 'The address did not change. Try again in a moment.',
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
  subject: 'Subject',
  received: 'Received',
  showMore: 'Show more',
  showLess: 'Show less',
  openPurchase: 'Open the purchase',
  readOnPattern: 'Read from a known layout',
  readByAi: 'Read by AI',
  fromEmail: 'From email',
  fromSender: 'From this sender',
  withSubject: 'With this subject',
  suggestionsCaption: 'Suggestions',
  suggestedByAi: 'Suggested by AI',
  saveFilter: 'Save filter',
  pickOne: 'Pick at least one',
  saveFailed: 'The filter did not save. Try again.',
  removeFailed: 'That did not go through. Try again.',
  progressFailed: "Couldn't save your place. Forwarding still works.",
  waitingShort: 'Waiting for your bank',
  drawerWaiting:
    'Read from your bank’s alert email. It merges on its own when your bank sends the same charge.',
  drawerFromEmail: 'Read from your bank’s alert email.',
  drawerWaitingByAi:
    'Read by AI from your bank’s alert email. It merges on its own when your bank sends the same charge.',
  drawerFromEmailByAi: 'Read by AI from your bank’s alert email.',
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
  confirm: 'Forwarding confirmation',
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

export const YAHOO_MAIL_URL = 'https://mail.yahoo.com/';
export const OUTLOOK_RULES_URL =
  'https://outlook.live.com/mail/0/options/mail/rules';
export const ICLOUD_MAIL_URL = 'https://www.icloud.com/mail/';

export const EMAIL_PROVIDER_NAMES: Record<EmailProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  icloud: 'iCloud',
  yahoo: 'Yahoo',
  other: 'your email',
};

export const EMAIL_SETUP_WORDS = {
  progress: (step: number, total: number) => `Step ${step} of ${total}`,
  next: 'Next',
  back: 'Back',
  done: 'Done',
  providerTitle: 'Which email do your bank alerts go to?',
  providerSubs: {
    gmail: 'Also Google Workspace',
    outlook: 'Also Hotmail and Live',
    icloud: 'Apple Mail',
    yahoo: 'Needs Yahoo Mail Plus',
    other: 'Any email that can forward',
  } satisfies Record<EmailProvider, string>,
  providerLabels: {
    gmail: 'Gmail',
    outlook: 'Outlook',
    icloud: 'iCloud',
    yahoo: 'Yahoo',
    other: 'Other',
  } satisfies Record<EmailProvider, string>,
  copyTitle: 'Copy your Runway address',
  copyLine:
    'Only you can see it. Your bank’s alerts forwarded here become purchases.',
  copyLabel: 'Copy address',
  gmailForwardingTitle: 'Add it as a forwarding address',
  gmailForwardingLines: [
    'In Gmail’s forwarding settings, choose “Add a forwarding address” and paste your address.',
    'Don’t turn on forwarding of all mail; the filter does that.',
  ],
  gmailForwardingLink: 'Open Gmail forwarding settings',
  yahooForwardingTitle: 'Turn on forwarding',
  yahooForwardingLines: [
    'In Yahoo Mail, go to Settings → More Settings → Mailboxes → your primary mailbox → Forwarding address.',
    'Paste your address and press Verify.',
    'Yahoo forwards all your mail; Runway skips anything that isn’t a bank alert without reading it.',
  ],
  yahooForwardingLink: 'Open Yahoo Mail',
  outlookRuleTitle: 'Make a rule for your bank’s alerts',
  outlookRuleLine: (address: string | null) =>
    `When it’s from ${address ?? 'your bank’s alert address'}, choose Forward to and paste your address.`,
  outlookRuleLink: 'Open Outlook rules',
  icloudRuleTitle: 'Make a rule for your bank’s alerts',
  icloudRuleLine: (address: string | null) =>
    `In iCloud Mail, go to Settings → Rules. When it’s from ${address ?? 'your bank’s alert address'}, forward it to your address.`,
  icloudRuleLink: 'Open iCloud Mail',
  otherRuleTitle: 'Set up forwarding',
  otherRuleLine: (address: string | null) =>
    address === null
      ? 'In your email’s settings, forward to your Runway address. A rule or filter for only your bank’s alerts works best.'
      : `In your email’s settings, make a rule that forwards mail from ${address} to your Runway address.`,
  alertAddressLead: 'Open one of your bank’s alerts and copy its From address.',
  alertAddressLabel: 'Your bank’s alert address',
  alertAddressPlaceholder: 'alerts@yourbank.com',
  confirmTitle: 'Confirm the forwarding address',
  confirmWaiting: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Waiting for the confirmation email…'
      : `Waiting for ${EMAIL_PROVIDER_NAMES[provider]}’s confirmation email…`,
  confirmButton: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Confirm forwarding'
      : `Confirm with ${EMAIL_PROVIDER_NAMES[provider]}`,
  confirmed: 'Confirmed',
  confirmFirst: (provider: EmailProvider) =>
    `${EMAIL_PROVIDER_NAMES[provider]} won’t forward until you confirm.`,
  didntArrive: 'Didn’t arrive?',
  didntArriveLines: (provider: EmailProvider) => [
    'Check that you pasted the address exactly.',
    provider === 'other'
      ? 'Send the confirmation again from your email’s forwarding settings.'
      : `Send it again from ${EMAIL_PROVIDER_NAMES[provider]}’s forwarding settings.`,
  ],
  linkFailed: 'Link didn’t work?',
  codeLine: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Enter this code where you set up forwarding'
      : `Enter this code in ${EMAIL_PROVIDER_NAMES[provider]}’s forwarding settings`,
  copyCode: 'Copy code',
  filterTitle: 'Only forward your bank’s alerts',
  filterPaste:
    'Paste it in Gmail’s search box, then choose Create filter → Forward it to → your Runway address.',
  filterNeedAddress: 'Type the address first',
  filterLabel: 'Copy filter text',
  filterLink: 'Open Gmail filters',
  testTitle: 'Try it with one alert',
  testLine: 'Forward one bank alert to your address.',
  testWaiting: 'Waiting for your first alert…',
  finishLater: 'Finish later',
  notArriving: 'Not arriving?',
  notArrivingLines: [
    'Forwarding is confirmed.',
    'The filter or rule forwards to your Runway address.',
    'The alert’s From address matches the one you typed.',
    'It can take a minute.',
  ],
  testDone: 'It worked. Your first purchase is in.',
  noFilterNotice:
    'Other emails might be reaching Runway; they’re skipped unread. Finish the filter step so only your bank’s alerts come here.',
  noFilterButton: 'Go to that step',
  noEmailsYet: 'No emails yet',
  workingSince: (when: string) => `Working · last email ${when}`,
  addressRow: 'Your address',
  setUpAgain: 'Set it up again',
  setUpAgainSub: 'Walk through the steps again',
  rowStep: (step: number, total: number) => `Step ${step} of ${total}`,
} as const;
