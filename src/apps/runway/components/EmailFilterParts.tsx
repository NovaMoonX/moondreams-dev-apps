import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Download, ExternalLink } from 'lucide-react';

import CopyTextButton from '@/components/CopyTextButton';
import { shareOrDownloadFiles } from '@/utils/fileUtils';
import {
  EMAIL_SETUP_WORDS,
  GMAIL_FILTERS_URL,
} from '@apps/runway/components/emailWords';
import {
  GMAIL_FILTER_FILE_NAME,
  buildGmailFilterXml,
  type FilterField,
} from '@apps/runway/utils/emailFilterFields';

const WORDS = EMAIL_SETUP_WORDS;

export interface NumberedItem {
  text: ReactNode;
  /** A step that only opens a page is itself the link, so its words are never repeated under it. */
  href?: string;
  control?: ReactNode;
}

export function NumberedSteps({ items }: { items: NumberedItem[] }) {
  return (
    <ol className='space-y-4'>
      {items.map((item, index) => (
        <li key={index} className='flex items-start gap-3'>
          <span
            className='bg-muted text-muted-foreground mt-px grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold'
            aria-hidden='true'
          >
            {index + 1}
          </span>
          <div className='min-w-0 flex-1 space-y-2'>
            <p className='text-sm break-words'>
              {item.href === undefined ? (
                item.text
              ) : (
                <a
                  href={item.href}
                  target='_blank'
                  rel='noreferrer'
                  className='text-primary -my-2.5 inline-block py-2.5 font-medium hover:underline'
                >
                  {item.text}
                  <ExternalLink
                    className='ml-1 inline size-3.5 align-[-2px]'
                    aria-hidden='true'
                  />
                </a>
              )}
            </p>
            {item.control}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The boxes of a provider's filter or rule form, each labelled as the form labels it, with a copy on every value, since a form takes one value at a time. */
export function FilterFields({ fields }: { fields: FilterField[] }) {
  return (
    <div className='space-y-3'>
      {fields.map((field) => (
        <div key={field.label} className='space-y-1'>
          <p className='text-muted-foreground text-xs font-medium'>
            {field.label}
          </p>
          <ul className='border-border divide-border divide-y rounded-xl border'>
            {field.values.map((value) => (
              <li
                key={value}
                className='flex min-h-11 items-center gap-2 py-1 pr-2 pl-3'
              >
                <span className='min-w-0 flex-1 font-mono text-xs [overflow-wrap:anywhere]'>
                  {value}
                </span>
                <CopyTextButton
                  text={value}
                  label={WORDS.copyField(field.label, value)}
                  variant='tertiary'
                  isIconOnly
                  isCompact
                  className='shrink-0'
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface GmailFilterImportProps {
  addresses: string[];
  forwardTo: string;
}

/** The filter as a file Gmail can import; offered only once the Runway address is confirmed, since Gmail refuses to forward to one that isn't. */
export function GmailFilterImport({
  addresses,
  forwardTo,
}: GmailFilterImportProps) {
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setError(null);
    const file = new File(
      [buildGmailFilterXml(addresses, forwardTo, Date.now())],
      GMAIL_FILTER_FILE_NAME,
      { type: 'text/xml' },
    );
    try {
      await shareOrDownloadFiles([file], { title: WORDS.filterDownload });
    } catch {
      setError(WORDS.filterDownloadFailed);
    }
  };

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>{WORDS.filterImportLead}</p>
      <Button
        className='w-full gap-1.5'
        variant='secondary'
        onClick={() => void download()}
      >
        <Download className='size-4' aria-hidden='true' />
        {WORDS.filterDownload}
      </Button>
      {error !== null && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
      <NumberedSteps
        items={[
          { text: WORDS.filterImportLink, href: GMAIL_FILTERS_URL },
          { text: WORDS.filterImportChoose },
          { text: WORDS.filterImportCreate },
        ]}
      />
    </div>
  );
}
