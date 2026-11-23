import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { EMAIL_FORWARDING_WORDS } from '@/components/emailForwarding/emailForwardingWords';
import FormSheet from '@/components/FormSheet';
import { formatDateTime } from '@/utils/formatUtils';

const LONG_TEXT_LENGTH = 240;

interface EmailMessageSheetProps {
  from: string;
  subject: string;
  /** When it reached the address, an instant shown in local time. */
  receivedAt: number;
  /** The text the server kept of the email; the quote is left out when empty. */
  text: string;
  onClose: () => void;
  /** What the app did with it ("Added as a ticket"), with its reason when there is one. */
  outcome?: ReactNode;
  /** The app's actions on it (open the record, filter out more like it), usually an `ActionGroup`. */
  children?: ReactNode;
  /** Icon buttons on the title's line (an app's eye that shows private text). */
  headerActions?: ReactNode;
  /** Draws subject and text through the app's own treatment, such as masking; default plain. */
  renderText?: (text: string) => ReactNode;
  /** Replaces the sheet's title ("Email"). */
  title?: string;
}

/** A drawer that looks like an email: From, Subject and Received, what the app did with it, the text in a quoted box with Show more, then the app's actions. */
function EmailMessageSheet({
  from,
  subject,
  receivedAt,
  text,
  onClose,
  outcome,
  children,
  headerActions,
  renderText = (value) => value,
  title = EMAIL_FORWARDING_WORDS.emailTitle,
}: EmailMessageSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = text.length > LONG_TEXT_LENGTH;

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={title}
      actions={headerActions}
    >
      <div className='space-y-4 pb-4'>
        <dl className='border-border bg-card grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-2xl border p-4 text-sm'>
          <dt className='text-muted-foreground'>
            {EMAIL_FORWARDING_WORDS.from}
          </dt>
          <dd className='min-w-0 break-words'>{from}</dd>
          <dt className='text-muted-foreground'>
            {EMAIL_FORWARDING_WORDS.subject}
          </dt>
          <dd className='min-w-0 font-medium break-words'>
            {renderText(subject || EMAIL_FORWARDING_WORDS.noSubject)}
          </dd>
          <dt className='text-muted-foreground'>
            {EMAIL_FORWARDING_WORDS.received}
          </dt>
          <dd className='min-w-0 break-words'>{formatDateTime(receivedAt)}</dd>
        </dl>
        {outcome}
        {text && (
          <div className='space-y-1'>
            <blockquote className='border-border bg-muted/60 border-l-4 px-3 py-2 text-sm'>
              <p
                className={join(
                  'break-words whitespace-pre-line',
                  isLong && !isExpanded && 'line-clamp-6',
                )}
              >
                {renderText(text)}
              </p>
            </blockquote>
            {isLong && (
              <Button
                variant='tertiary'
                size='sm'
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((current) => !current)}
              >
                {isExpanded
                  ? EMAIL_FORWARDING_WORDS.showLess
                  : EMAIL_FORWARDING_WORDS.showMore}
              </Button>
            )}
          </div>
        )}
        {children}
      </div>
    </FormSheet>
  );
}

export default EmailMessageSheet;
