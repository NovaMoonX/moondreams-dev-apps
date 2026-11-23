import type { EmailProvider } from '@/lib/emailForwarding/types';

/** What an app says in the walkthrough; every other word is shared. */
export interface EmailForwardingWords {
  /** The app's name, as in "Copy your Runway address". */
  appName: string;
  /** The mail being forwarded as a noun phrase that reads after "for" and "Only forward": "your bank’s alerts", "AMC’s ticket emails". */
  emails: string;
  /** The sender's usual From address when the app knows it (prefilled, still editable); null when the person must copy it. */
  senderAddress: string | null;
  /** An example in the sender's field, such as "alerts@yourbank.com". */
  senderAddressPlaceholder: string;
  /** Words the Gmail filter requires in the subject; empty for every subject. */
  gmailSubjectWords: readonly string[];
  /** The line under "Copy your address": what forwarding here does for the person. */
  copyLine: string;
  /** The test step's ask: "Forward one bank alert to your address." */
  testLine: string;
  /** The test step's done line: "It worked. Your first purchase is in." */
  testDone: string;
}

export const GMAIL_FILTERS_URL =
  'https://mail.google.com/mail/u/0/#settings/filters';
export const GMAIL_FORWARDING_URL =
  'https://mail.google.com/mail/u/0/#settings/fwdandpop';
export const YAHOO_MAIL_URL = 'https://mail.yahoo.com/';
export const OUTLOOK_RULES_URL =
  'https://outlook.live.com/mail/0/options/mail/rules';
export const ICLOUD_MAIL_URL = 'https://www.icloud.com/mail/';

export const EMAIL_PROVIDERS: EmailProvider[] = [
  'gmail',
  'outlook',
  'icloud',
  'yahoo',
  'other',
];

export const EMAIL_PROVIDER_NAMES: Record<EmailProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  icloud: 'iCloud',
  yahoo: 'Yahoo',
  other: 'your email',
};

/** The words every forwarding setup shares; the ones that name the app or its mail are functions of `EmailForwardingWords`. */
export const EMAIL_FORWARDING_WORDS = {
  progress: (step: number, total: number) => `Step ${step} of ${total}`,
  next: 'Next',
  back: 'Back',
  done: 'Done',
  providerTitle: (words: EmailForwardingWords) =>
    `Which email gets ${words.emails}?`,
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
  getAddress: 'Get your address',
  copyTitle: (words: EmailForwardingWords) =>
    `Copy your ${words.appName} address`,
  copyLabel: 'Copy address',
  gmailForwardingTitle: 'Add it as a forwarding address',
  gmailForwardingLines: [
    'In Gmail’s forwarding settings, choose “Add a forwarding address” and paste your address.',
    'Don’t turn on forwarding of all mail; the filter does that.',
  ],
  gmailForwardingLink: 'Open Gmail forwarding settings',
  yahooForwardingTitle: 'Turn on forwarding',
  yahooForwardingLines: (words: EmailForwardingWords) => [
    'In Yahoo Mail, go to Settings → More Settings → Mailboxes → your primary mailbox → Forwarding address.',
    'Paste your address and press Verify.',
    `Yahoo forwards all your mail; ${words.appName} skips everything else without reading it.`,
  ],
  yahooForwardingLink: 'Open Yahoo Mail',
  ruleTitle: (words: EmailForwardingWords) => `Make a rule for ${words.emails}`,
  outlookRuleLine: (address: string | null) =>
    `When it’s from ${address ?? 'the sender’s address'}, choose Forward to and paste your address.`,
  outlookRuleLink: 'Open Outlook rules',
  icloudRuleLine: (address: string | null) =>
    `In iCloud Mail, go to Settings → Rules. When it’s from ${address ?? 'the sender’s address'}, forward it to your address.`,
  icloudRuleLink: 'Open iCloud Mail',
  otherRuleTitle: 'Set up forwarding',
  otherRuleLine: (words: EmailForwardingWords, address: string | null) =>
    address === null
      ? `In your email’s settings, forward to your ${words.appName} address. A rule or filter for only ${words.emails} works best.`
      : `In your email’s settings, make a rule that forwards mail from ${address} to your ${words.appName} address.`,
  senderLead: (words: EmailForwardingWords) =>
    words.senderAddress === null
      ? `Open one of ${words.emails} and copy its From address.`
      : 'This is the usual From address. Change it if yours come from another.',
  senderLabel: 'The From address',
  confirmTitle: 'Confirm the forwarding address',
  confirmWaiting: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Waiting for the confirmation email…'
      : `Waiting for ${EMAIL_PROVIDER_NAMES[provider]}’s confirmation email…`,
  confirmButton: (provider: EmailProvider) =>
    provider === 'other'
      ? 'Confirm forwarding'
      : `Confirm with ${EMAIL_PROVIDER_NAMES[provider]}`,
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
  filterTitle: (words: EmailForwardingWords) => `Only forward ${words.emails}`,
  filterPaste: (words: EmailForwardingWords) =>
    `Paste it in Gmail’s search box, then choose Create filter → Forward it to → your ${words.appName} address.`,
  filterNeedAddress: 'Type the address first',
  filterLabel: 'Copy filter text',
  filterLink: 'Open Gmail filters',
  testTitle: 'Try it with one email',
  testWaiting: 'Waiting for your first email…',
  finishLater: 'Finish later',
  notArriving: 'Not arriving?',
  notArrivingLines: (words: EmailForwardingWords) => [
    'Forwarding is confirmed.',
    `The filter or rule forwards to your ${words.appName} address.`,
    'The email’s From address matches the one you typed.',
    'It can take a minute.',
  ],
  progressFailed: 'Couldn’t save your place. Forwarding still works.',
  noFilterNotice: (words: EmailForwardingWords) =>
    `Other emails might be reaching ${words.appName}; they’re skipped unread. Finish the filter step so only ${words.emails} come here.`,
  noFilterButton: 'Go to that step',
  noEmailsYet: 'No emails yet',
  workingSince: (when: string) => `Working · last email ${when}`,
  addressRow: 'Your address',
  copy: 'Copy',
  setUpAgain: 'Set it up again',
  setUpAgainSub: 'Walk through the steps again',
  newAddress: 'Get a new address',
  newAddressSub: 'Your old address stops working',
  newAddressTitle: 'Get a new address?',
  newAddressMessage:
    'Your old address stops working. Anything still forwarding to it will be lost.',
  addressFailed: 'The address did not change. Try again in a moment.',
  emailTitle: 'Email',
  from: 'From',
  subject: 'Subject',
  received: 'Received',
  noSubject: 'No subject',
  showMore: 'Show more',
  showLess: 'Show less',
} as const;
