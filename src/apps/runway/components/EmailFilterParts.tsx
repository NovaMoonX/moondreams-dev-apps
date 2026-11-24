import { Fragment, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';

import CopyTextButton from '@/components/CopyTextButton';
import { shareOrDownloadFiles } from '@/utils/fileUtils';
import { EMAIL_SETUP_WORDS } from '@apps/runway/components/emailWords';
import {
  GMAIL_FILTER_FILE_NAME,
  buildGmailFilterXml,
  type FilterField,
} from '@apps/runway/utils/emailFilterFields';

const WORDS = EMAIL_SETUP_WORDS;

/** An address that wraps before a dot in its name and keeps its domain whole, so a narrow screen never leaves ".com" alone. */
const domainParts = (domain: string) => {
  const labels = domain.split('.');
  if (labels.length <= 2) return [domain];
  return [
    ...labels.slice(0, -2).map((label) => `${label}.`),
    labels.slice(-2).join('.'),
  ];
};

export function AddressText({ address }: { address: string }) {
  const at = address.lastIndexOf('@');
  if (at < 0) return address;
  return (
    <>
      {address
        .slice(0, at)
        .split(/(?=\.)/)
        .map((part, index) => (
          <Fragment key={index}>
            {part}
            <wbr />
          </Fragment>
        ))}
      @<wbr />
      {domainParts(address.slice(at + 1)).map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          <span className='whitespace-nowrap'>{part}</span>
        </Fragment>
      ))}
    </>
  );
}

/** A step's quiet question (with `isOpen`) or second way (without), drawn as a muted line with a chevron. */
export function DisclosureLine({
  label,
  isOpen,
  onClick,
}: {
  label: string;
  isOpen?: boolean;
  onClick: () => void;
}) {
  const Icon = isOpen === undefined ? ChevronRight : ChevronDown;
  return (
    <Button
      variant='base'
      size='stripped'
      className='text-muted-foreground focus-visible:outline-primary relative inline-flex items-center gap-1 rounded-sm text-sm font-medium after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2'
      aria-expanded={isOpen}
      onClick={onClick}
    >
      {label}
      <Icon
        className={join('size-4 shrink-0', isOpen === true && 'rotate-180')}
        aria-hidden='true'
      />
    </Button>
  );
}

/** A value to copy: several words break only at their spaces, one address before a dot in its name. */
function FieldValue({ value }: { value: string }) {
  if (!value.includes(' ')) return <AddressText address={value} />;
  return value.split(' ').map((word, index) => (
    <Fragment key={index}>
      {index > 0 && ' '}
      {word.includes('@') ? (
        <AddressText address={word} />
      ) : (
        <span className='whitespace-nowrap'>{word}</span>
      )}
    </Fragment>
  ));
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
                  <FieldValue value={value} />
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

interface GmailFilterDownloadProps {
  addresses: string[];
  forwardTo: string;
}

/** The filter as a file Gmail can import; offered after the person confirms the address in Gmail, since Gmail won't forward to an unconfirmed one. */
export function GmailFilterDownload({
  addresses,
  forwardTo,
}: GmailFilterDownloadProps) {
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
    <div className='space-y-2'>
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
    </div>
  );
}
