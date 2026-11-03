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
import { toPrefilledMessage } from '@apps/going-once/utils/inquiries';
import { formatPaymentMethods } from '@apps/going-once/utils/paymentMethods';

interface InterestViewProps {
  thing: PublicThing;
  linkId: string;
  paymentMethods: string[];
  footerNode: HTMLElement | null;
  onBack: () => void;
  onDone: () => void;
  onRefused: (status: 'not_found' | 'not_available') => void;
}

type Sent = { contact: string };

const getRefusal = (result: InterestResult): string | null => {
  if (result.status === 'sent') return null;
  if (result.status === 'invalid') return INTEREST_INVALID_FIELDS[result.field];
  return INTEREST_REFUSALS[result.status];
};

const NAME_NOTE = 'Add your name so they know who you are';
const CONTACT_MISSING_NOTE = 'Add a phone number or an email.';
const CONTACT_INVALID_NOTE = 'Check that phone number or email.';
const HINT_CLASS = 'min-h-5 text-sm text-pretty text-(--going-once-hint)';

const getContactNote = (
  isTouched: boolean,
  contact: string,
  read: ReturnType<typeof readContact>,
) => {
  if (!isTouched || read !== null) return null;
  return contact.trim() === '' ? CONTACT_MISSING_NOTE : CONTACT_INVALID_NOTE;
};

/** The buyer's I'm interested form, swapped into the thing's drawer: a name, one phone-or-email field and a message, then its own Sent confirmation. Nothing on it says who is selling. */
function InterestView({
  thing,
  linkId,
  paymentMethods,
  footerNode,
  onBack,
  onDone,
  onRefused,
}: InterestViewProps) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState(
    toPrefilledMessage(thing.title, thing.status === 'PENDING'),
  );
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const { isWorking, run } = useSingleFlight();
  const read = readContact(contact);
  const [touched, setTouched] = useState({ name: false, contact: false });
  const isReady = name.trim() !== '' && read !== null;
  const nameNote = touched.name && name.trim() === '' ? NAME_NOTE : null;
  const contactNote = getContactNote(touched.contact, contact, read);
  const touch = (field: 'name' | 'contact') => () =>
    setTouched((current) => ({ ...current, [field]: true }));

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

  const footerNote = sent === null ? error : null;
  const footer =
    footerNode === null
      ? null
      : createPortal(
          <div className='space-y-2'>
            {sent === null && paymentMethods.length > 0 && (
              <p className='text-muted-foreground text-center text-xs text-pretty'>
                They take {formatPaymentMethods(paymentMethods)}.
              </p>
            )}
            {footerNote && (
              <p role='alert' className='text-destructive text-sm'>
                {footerNote}
              </p>
            )}
            {sent === null ? (
              <Button
                type='button'
                size='lg'
                rounded='full'
                className='w-full'
                disabled={isWorking || !isReady}
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
          Sent. The people running this sale can reach you at {sent.contact}.
        </p>
        <p className='text-muted-foreground text-sm'>
          About: {thing.title} · {formatCentsShort(thing.askingPriceCents)}
        </p>
        {footer}
      </div>
    );

  return (
    <div className='space-y-5 pb-28'>
      <BackLink onBack={onBack} label={thing.title} />
      {thing.status === 'PENDING' && (
        <p className='text-sm text-pretty'>
          Someone&apos;s picking this up. Ask anyway in case it falls through.
        </p>
      )}
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>Your name</p>
        <Input
          aria-label='Your name'
          placeholder='Your name'
          value={name}
          maxLength={MAX_INQUIRY_NAME_LENGTH}
          autoComplete='name'
          onChange={(event) => setName(event.target.value)}
          onBlur={touch('name')}
        />
        <p role='status' className={HINT_CLASS}>
          {nameNote}
        </p>
      </div>
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>Phone or email</p>
        <Input
          aria-label='Phone or email'
          placeholder='Phone or email'
          value={contact}
          maxLength={MAX_INQUIRY_CONTACT_LENGTH}
          autoComplete='off'
          autoCapitalize='none'
          autoCorrect='off'
          spellCheck={false}
          onChange={(event) => setContact(event.target.value)}
          onBlur={touch('contact')}
        />
        <p className='text-muted-foreground text-sm'>
          Only the people running this sale see this.
        </p>
        <p role='status' className={HINT_CLASS}>
          {contactNote}
        </p>
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
      {footer}
    </div>
  );
}

export default InterestView;
