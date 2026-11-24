import type {
  EmailFilterSealed,
  EmailOutcome,
  EmailProvider,
  EmailSetupStepId,
} from '@apps/runway/types';

const fromWhom = (addresses: string[]) => {
  if (addresses.length === 0) return 'your bank’s alert address';
  if (addresses.length === 1) return addresses[0];
  return 'any of the addresses below';
};
export const GMAIL_URL = 'https://mail.google.com/mail/';
export const GMAIL_FILTERS_URL =
  'https://mail.google.com/mail/#settings/filters';
export const GMAIL_FORWARDING_URL =
  'https://mail.google.com/mail/#settings/fwdandpop';

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
  showWholeEmail: 'Read the whole email',
  seeAll: 'See all',
  searchEmails: 'Search emails',
  searchFilters: 'Search filters',
  openPurchase: 'Open the purchase',
  readOnPattern: 'Read from a known layout',
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
export const PROTON_MAIL_URL = 'https://mail.proton.me/';

export const EMAIL_PROVIDER_NAMES: Record<EmailProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  icloud: 'iCloud',
  yahoo: 'Yahoo',
  proton: 'Proton Mail',
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
    proton: 'Needs a paid Proton plan',
    other: 'Any email that can forward',
  } satisfies Record<EmailProvider, string>,
  providerLabels: {
    gmail: 'Gmail',
    outlook: 'Outlook',
    icloud: 'iCloud',
    yahoo: 'Yahoo',
    proton: 'Proton Mail',
    other: 'Other',
  } satisfies Record<EmailProvider, string>,
  copyTitle: 'Copy your Runway address',
  copyLine:
    'Only you can see it. Your bank’s alerts forwarded here become purchases.',
  copyLabel: 'Copy address',
  gmailForwardingTitle: 'Add your address to Gmail',
  gmailForwardingOpen:
    'Click the search options icon (the sliders) in Gmail’s search bar',
  gmailForwardingLink: 'Open the Gmail your bank’s alerts go to',
  gmailForwardingFill:
    'Fill in these two boxes, so only your bank’s alerts match',
  gmailForwardingCreate:
    'Click “Create filter”, tick “Forward it to”, then click “add forwarding address”',
  gmailForwardingAdd:
    'On the page that opens, click “Add a forwarding address” and paste this',
  gmailForwardingProceed:
    'Click “Next”, “Proceed”, then “OK”. Gmail sends a verification, and the next step catches it',
  gmailForwardingNote: 'Leave forwarding on “Disable forwarding”. Only the filter forwards.',
  settingsLinkGmail: 'Open Gmail’s forwarding settings',
  yahooForwardingTitle: 'Turn on forwarding',
  yahooForwardingGo:
    'Go to Settings → More Settings → Mailboxes → your primary mailbox → Forwarding address',
  yahooForwardingPaste: 'Paste your address and press Verify',
  yahooForwardingNote:
    'Yahoo forwards all your mail; Runway only turns bank alerts into purchases and keeps just the subject and a few lines of anything else, for 30 days, so you can filter it out.',
  yahooForwardingLink: 'Open Yahoo Mail',
  outlookRuleTitle: 'Make a rule for your bank’s alerts',
  outlookRuleConditions:
    'Make a rule with these two conditions, so only your bank’s alerts match',
  outlookRuleForward: 'Choose Forward to and paste your Runway address',
  outlookRuleLink: 'Open Outlook’s rules',
  icloudRuleTitle: 'Make a rule for your bank’s alerts',
  icloudRuleOpen: 'Go to Settings → Rules',
  icloudRuleConditions:
    'Make a rule with these two conditions, so only your bank’s alerts match',
  icloudRuleForward: 'Choose Forward to and enter your Runway address',
  icloudRuleLink: 'Open iCloud Mail',
  protonRuleTitle: 'Make a forwarding rule for your bank’s alerts',
  protonRuleGo:
    'Go to Settings → All settings → Forward and auto-reply → Add forwarding rule',
  protonRulePaste: 'Paste your Runway address in Forward to',
  protonRuleCondition: (addresses: string[]) =>
    addresses.length > 1
      ? 'Choose Add condition → If → Sender → is, and enter the first address below; add one more Sender condition for each of the others'
      : `Choose Add condition → If → Sender → is, and enter ${fromWhom(addresses)}`,
  protonRuleSave:
    'Click Save. Proton sends an invitation to your Runway address, and the next step catches it',
  protonRuleNote:
    'Forwarding to another provider turns off end-to-end encryption for all mail on the Proton address you forward from. Your other Proton addresses aren’t affected.',
  protonRuleLink: 'Open Proton Mail',
  otherRuleTitle: 'Set up forwarding',
  otherRuleLine: (addresses: string[]) =>
    addresses.length === 0
      ? 'In your email’s settings, forward to your Runway address. A rule or filter for only your bank’s alerts works best'
      : `In your email’s settings, make a rule that forwards mail from ${fromWhom(addresses)} to your Runway address`,
  bankTitle: 'Which bank’s alerts?',
  coveredBankTitle: 'Which bank does your filter already cover?',
  coveredBankLine:
    'Add it first, so the updated filter or rule keeps it. Then add the new bank.',
  bankLine: 'The bank that emails you each time a card is used.',
  banksTitle: 'Your banks',
  knownBankSub: 'From your cards and accounts',
  anotherBank: 'Another bank',
  anotherBankSub: 'Type its name',
  bankNameLabel: 'Bank name',
  bankNamePlaceholder: 'Chase',
  addressLabel: 'Its alert email’s From address',
  addressHint: 'Open one of its alerts and copy the address next to From.',
  addressPlaceholder: 'alerts@chase.com',
  moreAddressPlaceholder: 'alerts@example.com',
  cancel: 'Cancel',
  addAddress: 'Add',
  addressInvalid: 'That isn’t an email address yet.',
  addressTaken: 'That address is already on the list.',
  addAnotherAddress: 'Add another address',
  addAnotherBank: 'Add another bank',
  removeAddress: (address: string) => `Remove ${address}`,
  bankNameNeeded: 'Type the bank’s name.',
  chooseOtherBank: 'Choose a different bank',
  addThisBank: (name: string) =>
    name.trim() ? `Add ${name.trim()}` : 'Add this bank',
  bankFirst: 'Pick your bank first, so the filter knows its alerts.',
  bankFirstButton: 'Back to your bank',
  banksSaveFailed: 'That didn’t save. Try again.',
  addBank: 'Add a bank',
  arrival: {
    arriving: 'Alerts arriving',
    waiting: 'Waiting for its first alert',
    quiet: 'No alerts in the last 30 days',
  },
  copyAddress: (address: string) => `Copy ${address}`,
  addressCount: (count: number) =>
    count === 1 ? '1 address' : `${count} addresses`,
  bankSheetAddresses: 'Its alert addresses',
  updateCaption: 'Then update your forwarding',
  updateGmailCopy: 'Change your Runway filter to these two boxes',
  updateGmailPaste:
    'In Gmail’s filter settings, click edit on your Runway filter, replace From and Subject with these, then click Continue and Update filter',
  updateFilterTitle: 'Update your Runway filter',
  updateRuleTitle: 'Update your forwarding rule',
  alreadyMade:
    'Already made one for Runway? Change it to match this instead of making a second.',
  noBanksYet:
    'Add the banks your filter or rule covers, so you can see when each one’s alerts arrive.',
  updateRule: (addresses: string[]) =>
    `In your forwarding rule, make sure it forwards mail from ${fromWhom(addresses)}`,
  updateRuleAdd: (provider: EmailProvider, added: string[]) => {
    const which = added.length === 1 ? 'this address' : 'these addresses';
    if (provider === 'proton') {
      return added.length === 1
        ? 'In your forwarding rule, add a Sender condition for this address'
        : 'In your forwarding rule, add a Sender condition for each of these addresses';
    }
    return `Add ${which} to your forwarding rule’s senders`;
  },
  updateRuleRemove: (removed: string[]) =>
    removed.length === 1
      ? 'Take this address out of your forwarding rule'
      : 'Take these addresses out of your forwarding rule',
  leaveSetupKept: 'You’ll pick up where you left off.',
  leaveAddKept: 'Banks you’ve added stay.',
  leaveDraftLost: 'The bank you were adding isn’t saved yet.',
  removeBank: 'Stop forwarding this bank',
  removeBankSub: 'Then take its addresses out of your filter or rule.',
  removeBankTitle: (name: string) => `Stop forwarding ${name}?`,
  removeBankMessage:
    'Runway forgets its addresses. Its alerts keep arriving until you take them out of your filter or rule.',
  confirmTitle: 'Confirm the forwarding address',
  confirmWaiting: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Waiting for the confirmation email…'
      : `Waiting for ${EMAIL_PROVIDER_NAMES[provider]}’s confirmation email…`,
  confirmButton: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Confirm forwarding'
      : `Confirm with ${EMAIL_PROVIDER_NAMES[provider]}`,
  confirmArrived: (provider: EmailProvider) =>
    provider === 'other'
      ? 'The confirmation email arrived'
      : `${EMAIL_PROVIDER_NAMES[provider]}’s email arrived`,
  confirmOpened: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Once your email says it’s confirmed, you’re set.'
      : `Once ${EMAIL_PROVIDER_NAMES[provider]} says it’s confirmed, you’re set.`,
  confirmOpenAgain: 'Open it again',
  nextAfterConfirm: (next: EmailSetupStepId | undefined) =>
    next === 'filter'
      ? 'Next: the filter'
      : next === 'test'
        ? 'Next: one alert'
        : 'Next',
  confirmed: 'Confirmed',
  confirmFirst: (provider: EmailProvider) =>
    `${EMAIL_PROVIDER_NAMES[provider]} won’t forward until you confirm.`,
  didntArrive: 'Didn’t arrive?',
  didntArriveLines: (provider: EmailProvider, isLate = false) => [
    'Check that you pasted the address exactly.',
    ...(provider === 'proton'
      ? [
          'In Forward and auto-reply, check the rule isn’t marked pending, then save it again.',
        ]
      : isLate
        ? []
        : [
            provider === 'other'
              ? 'Send the confirmation again from your email’s forwarding settings.'
              : `Send it again from ${EMAIL_PROVIDER_NAMES[provider]}’s forwarding settings.`,
          ]),
  ],
  linkFailed: 'Link didn’t work?',
  codeLine: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Enter this code where you set up forwarding'
      : `Enter this code in ${EMAIL_PROVIDER_NAMES[provider]}’s forwarding settings`,
  copyCode: 'Copy code',
  filterTitle: 'Finish the filter',
  filterPick:
    'Back in your filter, pick your Runway address under “Forward it to”, then click “Create filter”',
  filterClosed: 'The filter box closed?',
  filterClosedLine:
    'Click the search options icon again and fill in the same boxes, then click Create filter and tick Forward it to.',
  filterImportInstead: 'Import it from a file instead',
  filterByHand: 'Make it by hand instead',
  filterImportTitle: 'Import the filter',
  filterImportDownloadStep: 'Download the filter Gmail can import',
  filterDownload: 'Download mailFilters.xml',
  filterDownloadFailed: 'The file didn’t download. Try again.',
  filterImportChoose:
    'Click Import filters, then Choose file and pick mailFilters.xml',
  filterImportCreate: 'Click Open file, then Create filters',
  filterImportLink: 'Open Gmail’s filter settings',
  copyField: (label: string, value: string) => `Copy ${label}: ${value}`,
  addressForwardTo: 'Your Runway address',
  testTitle: 'Try it with one alert',
  testLine: 'Forward one bank alert to your address.',
  testWaiting: 'Waiting for your first alert…',
  stillWaiting: 'Nothing yet. It can take a few minutes.',
  testStillWaiting:
    'Nothing yet. Check the filter or rule forwards to your Runway address, then forward another alert.',
  confirmStillWaiting: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Nothing yet. Resend the confirmation from your email’s forwarding settings.'
      : 'Nothing yet. Try sending it again.',
  finishLater: 'Finish later',
  backStep: 'Back',
  partDone: 'Done',
  exitStep: 'Exit',
  notArriving: 'Not arriving?',
  notArrivingLines: [
    'Forwarding is confirmed.',
    'The filter or rule forwards to your Runway address.',
    'The alert’s From address is one you added for your bank.',
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
