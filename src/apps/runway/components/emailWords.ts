import { EMAIL_ADDRESS_PREFIX } from '@apps/runway/constants';
import type { EmailIntakeRead } from '@apps/runway/hooks/useEmailPurchases';
import type {
  EmailFilterSealed,
  EmailOutcome,
  EmailSenderKind,
} from '@apps/runway/types';

const SENDER_KIND_WORDS = {
  bank: 'Bank',
  store: 'Store',
  other: 'Not money',
} satisfies Record<EmailSenderKind, string>;

export const EMAIL_WORDS = {
  rowCaption: 'Email',
  rowSub: 'Forward bank alerts and store receipts',
  title: 'Email purchases',
  getAddress: 'Get your address',
  addressLoadFailed: 'Couldn’t load your address. Try again.',
  tryAgain: 'Try again',
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
  eventsCaption: 'What we’ve received',
  noEvents:
    'Nothing yet. Forward a recent bank alert or store receipt to see it land here.',
  sendersCaption: 'Who sends',
  senderDetail: (
    kind: EmailSenderKind,
    company: string | null,
    count: number,
    lastAt: string,
  ) =>
    `${company ?? SENDER_KIND_WORDS[kind]} · ${count === 1 ? '1 email' : `${count} emails`} · ${lastAt}`,
  showMore: (count: number) => `Show ${count} more`,
  showFewer: 'Show fewer',
  senderFilterOut: 'Filter out emails from this sender',
  senderFilterOutTitle: (address: string) =>
    `Filter out emails from ${address}?`,
  senderFilterOutMessage: 'Purchases from it won’t come in anymore.',
  senderFilterOutConfirm: 'Filter out',
  filteredOut: (address: string) => `Filtered out ${address}`,
  filterUndoFailed: 'That filter is still on. Remove it under Filtered out.',
  senderFilterSub: 'Future ones are skipped before anything is read.',
  senderCovered: 'A filter already covers this sender.',
  senderHadPurchases: 'Some of these became purchases. This stops that.',
  workingSince: (when: string) => `Working · last email ${when}`,
  lastEmail: (when: string) => `Last email ${when}`,
  addAnother: (hasEmails: boolean) =>
    hasEmails ? 'Add another bank or store' : 'Forward a bank or store',
  addAnotherSub: (address: string) => `Send its emails to ${address}`,
  setupLine:
    'Forward your bank alerts and store receipts here, by hand or with your email’s own rules.',
  copyAddress: 'Copy address',
  copyFailed: 'Couldn’t copy it. Press and hold the address to copy it.',
  done: 'Done',
  confirmAsked: (provider: string) => `${provider} asked to confirm forwarding`,
  confirmButton: (provider: string | null) =>
    provider === null ? 'Confirm forwarding' : `Confirm with ${provider}`,
  confirmCodeLine: (provider: string | null) =>
    provider === null
      ? 'Enter this code where you set up forwarding'
      : `Enter this code in ${provider}’s forwarding settings`,
  copyCode: 'Copy code',
  confirmedBy: (provider: string) =>
    `Runway confirmed ${provider}’s forwarding`,
  confirmStillNeeded: (provider: string | null) =>
    `${provider ?? 'Your email'} still needs your OK`,
  confirmAgain: 'Confirm again',
  emailTitle: 'Email',
  filterOut: 'Filter out emails like this',
  filterOutSub: 'Future ones are skipped before anything is read.',
  filterOutRowSub: 'Emails like this won’t become purchases',
  unreadLine:
    'Runway couldn’t find an amount and a place in this email. If it was a purchase, add it from Add a purchase.',
  notPurchaseLine: 'Runway didn’t find a purchase in it.',
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
  saveFilter: 'Filter out',
  pickOne: 'Pick at least one',
  saveFailed: 'The filter did not save. Try again.',
  removeFailed: 'That did not go through. Try again.',
  progressFailed: "Couldn't save your place. Forwarding still works.",
  waitingShort: 'Waiting for your bank',
  waitingOn: (bank: string) => `Waiting on ${bank}`,
  sameTitle: 'Is this from one of these emails?',
  sameRow: (date: string) => `Email from ${date} · Counted once`,
  drawerWaiting:
    'Read from your bank’s alert email. It merges on its own when your bank sends the same charge.',
  drawerWaitingNamed: (bank: string) =>
    `Read from your bank’s alert email. It merges on its own when ${bank} sends the same charge.`,
  drawerStoreWaitingNamed: (bank: string) =>
    `Read from the store’s email. It merges on its own when ${bank} sends the same charge.`,
  drawerPostedOnly: (bank: string, isStore: boolean) =>
    `Read from ${isStore ? 'the store’s' : 'your bank’s alert'} email. It merges once ${bank} posts the charge, often days later.`,
  emailActionsCaption: 'The email',
  drawerFromEmail: 'Read from your bank’s alert email.',
  drawerFromStore: 'Read from the store’s email.',
  drawerStoreWaiting:
    'Read from the store’s email. It merges on its own when your bank sends the same charge.',
  stopWaiting: 'Stop waiting for your bank',
  overdueNotice: (days: number) =>
    `Your bank hasn’t sent this charge in ${days} days. Stop waiting to keep it as it is, or remove it.`,
  overdueOrderNotice: (days: number) =>
    `Your bank hasn’t sent this charge in ${days} days. Stores often charge when an order ships. Stop waiting to keep it as it is, or remove it.`,
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

const OUTCOME_ROW_WORDS: Record<EmailOutcome, string> = {
  purchase: 'Purchase',
  notPurchase: 'No purchase',
  filtered: 'Filtered out',
  confirm: 'Confirmation',
  unread: 'Couldn’t read it',
  notTracking: 'Not tracking that day',
  refund: 'Refund',
  cancel: 'Cancellation',
};

export const describeEmailRowOutcome = (outcome: EmailOutcome) =>
  OUTCOME_ROW_WORDS[outcome];

const OUTCOME_WORDS: Record<EmailOutcome, string> = {
  purchase: 'Added as a purchase',
  notPurchase: 'Not a purchase',
  filtered: 'Filtered out',
  confirm: 'Forwarding confirmation',
  unread: 'Couldn’t read it',
  notTracking: 'Not tracking that day',
  refund: 'A refund from the store',
  cancel: 'A cancelled order',
};

export const describeEmailOutcome = (outcome: EmailOutcome) =>
  OUTCOME_WORDS[outcome];

const FORWARD_PREFIX = /^\s*(?:(?:fwd?|tr|wg)\s*:\s*)+/i;

/** A subject without the "Fwd:" (or "FW:", "TR:", "WG:") a forward adds, however many times it was added. */
export const stripForwardPrefix = (subject: string) =>
  subject.replace(FORWARD_PREFIX, '').trim();

/** A subject's shape as the person reads it: its placeholders said in words. */
export const readSubjectTemplate = (template: string) =>
  stripForwardPrefix(template)
    .replaceAll('{amount}', 'any amount')
    .replaceAll('{date}', 'any date')
    .replaceAll('{n}', 'any number');

export const FILTER_FROM_WORDS = 'From ';

/** A filter as a name and one more line, in the person's words. */
export function describeEmailFilter(filter: EmailFilterSealed): {
  name: string;
  detail: string | null;
} {
  const parts = [
    ...(filter.fromAddress
      ? [`${FILTER_FROM_WORDS}${filter.fromAddress}`]
      : []),
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

/** The providers whose forwarding confirmation Functions recognise, as the person knows them. */
export const CONFIRM_PROVIDER_NAMES = {
  gmail: 'Gmail',
  yahoo: 'Yahoo',
  proton: 'Proton Mail',
} as const;

export const shortenForwardingAddress = (address: string) => {
  const [name, ...host] = address.split('@');
  const keep = EMAIL_ADDRESS_PREFIX.length + 1 + 4;
  return name.length <= keep + 1
    ? address
    : `${name.slice(0, keep)}…@${host.join('@')}`;
};

type EmailConfirm = NonNullable<EmailIntakeRead['confirm']>;

export const readConfirmLink = (confirm: EmailConfirm) =>
  confirm.url?.startsWith('https://') ? confirm.url : null;

export const hasConfirmNotice = (confirm: EmailConfirm) =>
  confirm.autoConfirm === 'confirmed' ||
  readConfirmLink(confirm) !== null ||
  confirm.code !== null;
