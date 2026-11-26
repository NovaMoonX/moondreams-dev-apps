/** The words every forwarding screen shares; an app supplies its name and its setup line. */
export const EMAIL_FORWARDING_WORDS = {
  getAddress: 'Get your address',
  addressLoadFailed: 'Couldn’t load your address. Try again.',
  tryAgain: 'Try again',
  copyAddress: 'Copy address',
  copyFailed: 'Couldn’t copy it. Press and hold the address to copy it.',
  done: 'Done',
  filterTitle: 'A filter to start from',
  filterLine: (sender: string, phrase: string) =>
    `Emails from ${sender} that contain “${phrase}”. In Gmail this search finds them:`,
  filterCheck:
    'It’s a suggestion: search it first and check that every result is an email you want to send here.',
  guideTitle: 'Set it up in your email',
  guideLine:
    'Your email’s own help shows how to forward automatically. Which do you use?',
  guidePickLabel: 'Your email service',
  otherProvider: 'Other',
  paidPill: 'Paid',
  paidAria: (provider: string, plan: string) => `${provider}, needs ${plan}`,
  paidLine: (provider: string, plan: string) =>
    `${provider} forwards automatically only with ${plan}. You can still forward an email by hand.`,
  openGuide: (provider: string) => `Open ${provider}’s guide`,
  watchVideo: (provider: string) => `Watch ${provider}’s video`,
  otherGuide:
    'Search your email’s help for “automatic forwarding”, and use this address where it asks for one.',
  copySearch: 'Copy search',
  searchCopyFailed: 'Couldn’t copy it. Press and hold the search to copy it.',
  noEmailsYet: 'No emails yet',
  waitingForFirst:
    'Waiting for your first email. This updates on its own once one arrives.',
  workingSince: (when: string) => `Working · last email ${when}`,
  addressRow: 'Your address',
  newAddress: 'Get a new address',
  newAddressSub: 'Your old address stops working',
  newAddressTitle: 'Get a new address?',
  newAddressMessage:
    'Your old address stops working. Anything still forwarding to it will be lost.',
  addressFailed: 'The address did not change. Try again in a moment.',
  confirmAsked: (provider: string) => `${provider} asked to confirm forwarding`,
  confirmButton: (provider: string | null) =>
    provider === null ? 'Confirm forwarding' : `Confirm with ${provider}`,
  confirmCodeLine: (provider: string | null) =>
    provider === null
      ? 'Enter this code where you set up forwarding'
      : `Enter this code in ${provider}’s forwarding settings`,
  copyCode: 'Copy code',
  confirmedBy: (appName: string, provider: string) =>
    `${appName} confirmed ${provider}’s forwarding`,
  confirmWaiting: (provider: string | null) =>
    provider === null
      ? 'Once you’ve confirmed it, this clears when the next forwarded email comes through.'
      : `Once you’ve confirmed it in ${provider}, this clears when ${provider} forwards its next email.`,
  confirmAgain: 'Confirm again',
  emailTitle: 'Email',
  from: 'From',
  subject: 'Subject',
  received: 'Received',
  noSubject: 'No subject',
  showWholeEmail: 'View the email',
  showWholeEmailSubtitle: 'The part of it that was kept',
} as const;
