import type { EmailProvider } from '@apps/runway/types';

const ALERT_SUBJECT_WORDS = [
  'purchase',
  'charge',
  'transaction',
  'spent',
  'alert',
];

/** One box of a provider's filter or rule form, named as that form names it; each value is typed or pasted on its own. */
export interface FilterField {
  label: string;
  values: string[];
}

const FIELD_LABELS: Partial<
  Record<EmailProvider, { from: string; subject: string }>
> = {
  gmail: { from: 'From', subject: 'Subject' },
  outlook: { from: 'From', subject: 'Subject includes' },
  icloud: { from: 'From', subject: 'Subject contains' },
};

/** Gmail's boxes take several words joined by OR; Outlook's and iCloud's take one value at a time. */
export function getFilterFields(
  provider: EmailProvider,
  addresses: string[],
): FilterField[] {
  const labels = FIELD_LABELS[provider];
  if (labels === undefined || addresses.length === 0) return [];
  const isJoined = provider === 'gmail';
  const join = (values: string[]) =>
    isJoined ? [values.join(' OR ')] : values;
  return [
    { label: labels.from, values: join(addresses) },
    { label: labels.subject, values: join(ALERT_SUBJECT_WORDS) },
  ];
}

export const GMAIL_FILTER_FILE_NAME = 'mailFilters.xml';

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll("'", '&apos;')
    .replaceAll('"', '&quot;');

/** A Gmail filter file in the format Gmail exports, ready for Settings, Filters and Blocked Addresses, Import filters. */
export function buildGmailFilterXml(
  addresses: string[],
  forwardTo: string,
  now: number,
): string {
  const [from, subject] = getFilterFields('gmail', addresses);
  const updated = new Date(now).toISOString();
  const property = (name: string, value: string) =>
    `    <apps:property name='${name}' value='${escapeXml(value)}'/>`;
  return [
    `<?xml version='1.0' encoding='UTF-8'?>`,
    `<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>`,
    `  <title>Mail Filters</title>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>Runway</name></author>`,
    `  <entry>`,
    `    <category term='filter'></category>`,
    `    <title>Mail Filter</title>`,
    `    <updated>${updated}</updated>`,
    `    <content></content>`,
    property('from', from.values[0]),
    property('subject', subject.values[0]),
    property('forwardTo', forwardTo),
    `  </entry>`,
    `</feed>`,
    ``,
  ].join('\n');
}
