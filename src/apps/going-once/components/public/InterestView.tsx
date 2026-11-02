import { useState } from 'react';

import { Button, Input, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { createPortal } from 'react-dom';

import BackLink from '@/components/BackLink';
import { formatCentsShort } from '@/utils/moneyUtils';
import {
  INTEREST_FAILURE,
  INTEREST_INVALID_FIELDS,
  INTEREST_REFUSALS,
  MAX_INQUIRY_CONTACT_LENGTH,
  MAX_INQUIRY_MESSAGE_LENGTH,
  MAX_INQUIRY_NAME_LENGTH,
} from '@apps/going-once/constants';
import { useSingleFlight } from '@apps/going-once/hooks/useSingleFlight';
import { sendInterest } from '@apps/going-once/queries/salePageQueries';
import type { InterestResult, PublicThing } from '@apps/going-once/types';
import { formatPhone, readContact } from '@apps/going-once/utils/contact';

interface InterestViewProps {
  thing: PublicThing;
  linkId: string;
  /** The drawer's footer, once it is drawn. */
  footerNode: HTMLElement | null;
  onBack: () => void;
  onDone: () => void;
  /** Tells the drawer a refusal that changes what it offers after this view closes. */
  onRefused: (status: 'not_found' | 'not_available') => void;
}

type Sent = { contact: string };

const getRefusal = (result: InterestResult): string | null => {
  if (result.status === 'sent') return null;
  if (result.status === 'invalid') return INTEREST_INVALID_FIELDS[result.field];
  return INTEREST_REFUSALS[result.status];
};

const getMissingNote = (hasName: boolean, hasContact: boolean) => {
  if (!hasName && !hasContact) return 'Add your name and a phone or email';
  if (!hasName) return 'Add your name';
  if (!hasContact) return 'Add a phone or email that looks real';
  return null;
};

/** The buyer's I'm interested form, swapped into the thing's drawer: a name, one phone-or-email field and a message, then its own Sent confirmation. Nothing on it says who is selling. */
function InterestView({
  thing,
  linkId,
  footerNode,
  onBack,
  onDone,
  onRefused,
}: InterestViewProps) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState(
    `Hi! Is the ${thing.title} still available?`,
  );
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const { isWorking, run } = useSingleFlight();
  const read = readContact(contact);
  const missingNote = getMissingNote(name.trim() !== '', read !== null);

  const send = () =>
    run(async () => {
      setError(null);
      try {
        const result = await sendInterest({
          linkId,
          itemId: thing.id,
          name: name.trim(),
          contact: contact.trim(),
          message: message.trim(),
          website,
        });
        if (result.status === 'sent') {
          setSent({
            contact:
              read?.kind === 'phone'
                ? formatPhone(read.value)
                : (read?.value ?? ''),
          });
          return;
        }
        if (result.status === 'not_available' || result.status === 'not_found')
          onRefused(result.status);
        setError(getRefusal(result));
      } catch {
        setError(INTEREST_FAILURE);
      }
    });

  const footerNote = sent === null ? (error ?? missingNote) : null;
  const footer =
    footerNode === null
      ? null
      : createPortal(
          <div className='space-y-2'>
            {footerNote && (
              <p
                role={error === null ? 'status' : 'alert'}
                className={
                  error === null
                    ? 'text-muted-foreground text-sm'
                    : 'text-destructive text-sm'
                }
              >
                {footerNote}
              </p>
            )}
            {sent === null ? (
              <Button
                type='button'
                size='lg'
                rounded='full'
                className='w-full'
                disabled={isWorking || missingNote !== null}
                onClick={() => void send()}
              >
                Send
              </Button>
            ) : (
              <Button
                type='button'
                size='lg'
                rounded='full'
                className='w-full'
                onClick={onDone}
              >
                Done
              </Button>
            )}
          </div>,
          footerNode,
        );

  if (sent !== null)
    return (
      <div className='space-y-4'>
        <p className='text-lg font-semibold'>
          Sent. The seller will reach out to you at {sent.contact}.
        </p>
        <p className='text-muted-foreground text-sm'>
          About: {thing.title} · {formatCentsShort(thing.askingPriceCents)}
        </p>
        {footer}
      </div>
    );

  return (
    <div className='space-y-5'>
      <BackLink onBack={onBack} label={thing.title} />
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>Your name</p>
        <Input
          aria-label='Your name'
          placeholder='Your name'
          value={name}
          maxLength={MAX_INQUIRY_NAME_LENGTH}
          autoComplete='name'
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>Phone or email</p>
        <Input
          aria-label='Phone or email'
          placeholder='Phone or email'
          value={contact}
          maxLength={MAX_INQUIRY_CONTACT_LENGTH}
          inputMode='email'
          autoComplete='off'
          autoCapitalize='none'
          autoCorrect='off'
          spellCheck={false}
          onChange={(event) => setContact(event.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>Message</p>
        <Textarea
          aria-label='Message'
          rows={3}
          value={message}
          maxLength={MAX_INQUIRY_MESSAGE_LENGTH}
          onChange={(event) => setMessage(event.target.value)}
        />
      </div>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0'
      >
        <Input
          tabIndex={-1}
          name='website'
          autoComplete='off'
          aria-label='Leave this empty'
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>
      <p className='text-muted-foreground text-sm'>
        Only the people running this sale see this.
      </p>
      {footer}
    </div>
  );
}

export default InterestView;
