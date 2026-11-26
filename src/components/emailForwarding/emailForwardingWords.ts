const confirmButton = (provider: string | null) =>
  provider === null ? 'Confirm forwarding' : `Confirm with ${provider}`;

/** The words every forwarding screen shares; an app supplies its name and its setup line. */
export const EMAIL_FORWARDING_WORDS = {
  getAddress: 'Get your address',
  addressLoadFailed: 'Couldn’t load your address. Try again.',
  tryAgain: 'Try again',
  copyAddress: 'Copy address',
  copyFailed: 'Couldn’t copy it. Press and hold the address to copy it.',
  done: 'Done',
  filterCheck:
    'It’s a suggestion: search it first and check that every result is an email you want to send here.',
  notSure: 'Not sure how?',
  notSureSub: 'Your email’s own guide, and what to paste',
  guideTitle: 'Set up forwarding',
  guidePickLabel: 'Which email do you use?',
  otherProvider: 'Other',
  paidPill: 'Paid',
  paidAria: (provider: string, plan: string) => `${provider}, needs ${plan}`,
  paidLine: (plan: string) =>
    `Forwarding on its own needs ${plan}. You can still forward an email by hand.`,
  openGuide: (provider: string) => `Open ${provider}’s guide`,
  otherStep:
    'Search your email’s help for “automatic forwarding” and follow it.',
  watchVideo: (provider: string) => `Watch ${provider}’s video`,
  addressStep: 'Where it asks for an address, paste yours.',
  searchStep: 'If it asks which emails to forward, use this search.',
  noSearchStep:
    'If it asks which emails to forward, pick the ones you want sent here.',
  stepCopy: 'Copy your address',
  stepCopyLine:
    'Copy it now. You’ll paste it where your email asks where to forward.',
  stepCopyDone: 'Copied. Paste it where your email asks where to forward.',
  copyAgain: 'Copy again',
  stepForward: 'Turn on forwarding in your email',
  stepForwardLine:
    'Use your email’s own settings to forward these emails to your address.',
  stepConfirm: 'Confirm, if your email asks',
  stepConfirmLine:
    'Some email services send a confirmation to your address first. If yours does, it shows here.',
  stepConfirmDone: 'Nothing left to confirm',
  stepForwardSaid: 'You said it’s on.',
  stepForwardSeen: 'Your email is forwarding here.',
  forwardOnButton: 'I’ve turned it on',
  undoForward: 'I haven’t turned it on yet',
  skipConfirm: 'My email didn’t ask',
  stepConfirmSkipped:
    'You said your email didn’t ask. If a confirmation comes in anyway, it opens here.',
  undoSkip: 'Undo skip',
  stepFirstLater: 'Once forwarding is on, your first email shows here.',
  stepFirst: 'Your first email comes in',
  stepDone: 'Done',
  allSetTitle: 'You’re all set',
  allSetLine: 'Nothing else to do. New emails come in on their own.',
  copySearch: 'Copy search',
  searchCopyFailed: 'Couldn’t copy it. Press and hold the search to copy it.',
  noEmailsYet: 'No emails yet',
  waitingForFirst: 'Waiting for it. This updates on its own once one arrives.',
  workingSince: (when: string) => `Working · last email ${when}`,
  addressRow: 'Your address',
  newAddress: 'Get a new address',
  newAddressSub: 'Your old address stops working',
  newAddressTitle: 'Get a new address?',
  newAddressMessage:
    'Your old address stops working. Anything still forwarding to it will be lost.',
  addressFailed: 'The address did not change. Try again in a moment.',
  confirmAsked: (provider: string) => `${provider} asked to confirm forwarding`,
  confirmButton,
  confirmCodeLine: (provider: string | null) =>
    provider === null
      ? 'Enter this code where you set up forwarding'
      : `Enter this code in ${provider}’s forwarding settings`,
  copyCode: 'Copy code',
  codeCopyFailed: 'Couldn’t copy it. Press and hold the code to copy it.',
  confirmWithFooter: (provider: string | null) =>
    `Tap ${confirmButton(provider)} below to open it, then come back here.`,
  confirmedBy: (appName: string, provider: string) =>
    `${appName} confirmed ${provider}’s forwarding`,
  confirmWaiting:
    'Once you’ve confirmed it, this clears when your next forwarded email comes in.',
  confirmAgain: 'Confirm again',
  emailTitle: 'Email',
  from: 'From',
  subject: 'Subject',
  received: 'Received',
  noSubject: 'No subject',
  showWholeEmail: 'View the email',
  showWholeEmailSubtitle: 'The part of it that was kept',
} as const;
