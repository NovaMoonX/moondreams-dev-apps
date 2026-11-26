export type MailProviderId =
  'gmail' | 'outlook' | 'icloud' | 'yahoo' | 'proton';

export interface MailProviderGuide {
  id: MailProviderId;
  name: string;
  /** The provider's own help article on forwarding mail automatically, ideally only the emails that match a rule. */
  articleUrl: string;
  /** A walkthrough video from the provider's own channel; null when it has none, since anyone else's goes stale unseen. */
  videoUrl: string | null;
  /** A paid plan the provider requires for automatic forwarding, named on the choice; null when free accounts can. */
  paidPlan: string | null;
}

/**
 * Every app that takes forwarded mail links these, so a moved article is fixed here once.
 * Checked against each provider's help site on 2026-11-26.
 */
export const MAIL_PROVIDER_GUIDES: readonly MailProviderGuide[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    articleUrl: 'https://support.google.com/mail/answer/10957',
    videoUrl: null,
    paidPlan: null,
  },
  {
    id: 'outlook',
    name: 'Outlook',
    articleUrl:
      'https://support.microsoft.com/en-us/outlook/mail/use-rules-to-automatically-forward-messages',
    videoUrl: null,
    paidPlan: null,
  },
  {
    id: 'icloud',
    name: 'iCloud',
    articleUrl:
      'https://support.apple.com/guide/icloud/automatically-forward-email-mm6b1a3960/icloud',
    videoUrl: null,
    paidPlan: null,
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    articleUrl: 'https://help.yahoo.com/kb/SLN29133.html',
    videoUrl: null,
    paidPlan: 'Yahoo Mail Plus',
  },
  {
    id: 'proton',
    name: 'Proton Mail',
    articleUrl: 'https://proton.me/support/email-forwarding',
    videoUrl: null,
    paidPlan: 'a paid Proton plan',
  },
];
