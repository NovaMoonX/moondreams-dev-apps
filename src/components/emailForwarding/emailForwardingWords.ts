/** The words every forwarding screen shares; an app supplies its name and its setup line. */
export const EMAIL_FORWARDING_WORDS = {
  getAddress: 'Get your address',
  addressLoadFailed: 'Couldn’t load your address. Try again.',
  tryAgain: 'Try again',
  copyAddress: 'Copy address',
  copyFailed: 'Couldn’t copy it. Press and hold the address to copy it.',
  done: 'Done',
  noEmailsYet: 'No emails yet',
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
