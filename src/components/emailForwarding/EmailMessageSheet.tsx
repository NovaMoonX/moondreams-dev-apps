import { useState, type ReactNode } from 'react';

import { Mail } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { EMAIL_FORWARDING_WORDS } from '@/components/emailForwarding/emailForwardingWords';
import FormSheet from '@/components/FormSheet';
import Subview from '@/components/Subview';
import { formatDateTime } from '@/utils/formatUtils';

interface EmailMessageSheetProps {
  from: string;
  subject: string;
  /** When it reached the address, an instant shown in local time. */
  receivedAt: number;
  /** The few lines the server kept as an excerpt, shown behind "View the email"; the row is left out when empty and no whole text was kept. */
  text: string;
  /** The whole email's readable text when the server kept it, shown in place of the excerpt; null or omitted when none was kept. */
  wholeText?: string | null;
  onClose: () => void;
  /** What the app did with it ("Added to your list"), with its reason when there is one. */
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

interface EmailHeaderProps {
  from: string;
  subject: string;
  receivedAt: number;
  renderText: (text: string) => ReactNode;
}

function EmailHeader({
  from,
  subject,
  receivedAt,
  renderText,
}: EmailHeaderProps) {
  return (
    <dl className='border-border bg-card grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-2xl border p-4 text-sm'>
      <dt className='text-muted-foreground'>{EMAIL_FORWARDING_WORDS.from}</dt>
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
  );
}

/** A drawer that looks like an email: From, Subject and Received, what the app did with it, then "View the email" (the kept text on its own screen) and the app's actions. */
function EmailMessageSheet({
  from,
  subject,
  receivedAt,
  text,
  wholeText = null,
  onClose,
  outcome,
  children,
  headerActions,
  renderText = (value) => value,
  title = EMAIL_FORWARDING_WORDS.emailTitle,
}: EmailMessageSheetProps) {
  const [isEmailShown, setIsEmailShown] = useState(false);
  const shownText = (wholeText ?? text).trim();

  if (isEmailShown && shownText !== '') {
    return (
      <Subview
        overlay
        title={title}
        onClose={() => setIsEmailShown(false)}
        headerAction={headerActions}
      >
        <div className='space-y-4'>
          <EmailHeader
            from={from}
            subject={subject}
            receivedAt={receivedAt}
            renderText={renderText}
          />
          <p className='text-sm break-words whitespace-pre-line'>
            {renderText(shownText)}
          </p>
        </div>
      </Subview>
    );
  }

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      onClose={onClose}
      title={title}
      actions={headerActions}
    >
      <div className='space-y-4 pb-4'>
        <EmailHeader
          from={from}
          subject={subject}
          receivedAt={receivedAt}
          renderText={renderText}
        />
        {outcome}
        {shownText !== '' && (
          <ActionGroup>
            <ActionRow
              isGrouped
              hasChevron
              icon={<Mail />}
              label={EMAIL_FORWARDING_WORDS.showWholeEmail}
              subtitle={EMAIL_FORWARDING_WORDS.showWholeEmailSubtitle}
              onClick={() => setIsEmailShown(true)}
            />
          </ActionGroup>
        )}
        {children}
      </div>
    </FormSheet>
  );
}

export default EmailMessageSheet;
