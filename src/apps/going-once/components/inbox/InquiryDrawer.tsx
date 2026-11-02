import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Ellipsis,
  Mail,
  MessageSquare,
  Phone,
  Trash2,
  Undo2,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import {
  backToNew,
  deleteInquiry,
  markHandled,
} from '@apps/going-once/store/actions/inquiryActions';
import type { Inquiry } from '@apps/going-once/types';
import { formatPhone } from '@apps/going-once/utils/contact';
import {
  formatSentAt,
  getInquirerName,
} from '@apps/going-once/utils/inquiries';

interface InquiryDrawerProps {
  inquiry: Inquiry;
  uid: string;
  /** The thing it is about, already worded ("Gray sofa (No longer listed)"). */
  thing: string;
  /** Who handled it, for a Handled inquiry. */
  handledBy: string | null;
  now: number;
  onClose: () => void;
}

const REACH_LINK =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium';

const getStatusLine = (
  inquiry: Inquiry,
  handledBy: string | null,
  now: number,
) => {
  const resent =
    inquiry.sendCount > 1
      ? `Sent ${inquiry.sendCount} times · latest ${formatSentAt(inquiry.lastSentAt, now)}`
      : null;
  if (inquiry.status === 'NEW' || inquiry.handledAt === null)
    return [resent ?? formatSentAt(inquiry.lastSentAt, now), 'New'].join(' · ');
  return [
    `Handled by ${handledBy ?? 'someone'} · ${formatSentAt(inquiry.handledAt, now)}`,
    resent,
  ]
    .filter((part) => part !== null)
    .join(' · ');
};

/** One inquiry in full: the message, the ways to reach the person as native links, and Mark handled; Back to New and Delete sit behind More. */
function InquiryDrawer({
  inquiry,
  uid,
  thing,
  handledBy,
  now,
  onClose,
}: InquiryDrawerProps) {
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const name = getInquirerName(inquiry);
  const isNew = inquiry.status === 'NEW';

  const showFailure = (title: string) => () =>
    addToast({
      title,
      description: 'Check your connection and try again.',
      type: 'error',
    });

  const handle = () =>
    void markHandled(inquiry.saleId, inquiry.id, uid).catch(
      showFailure("Couldn't mark it handled"),
    );
  const reopen = () => {
    setIsMoreOpen(false);
    void backToNew(inquiry.saleId, inquiry.id).catch(
      showFailure("Couldn't move it back to New"),
    );
  };
  const remove = async () => {
    const isConfirmed = await confirm({
      title: `Delete ${name}'s message?`,
      message: `${thing}${inquiry.sendCount > 1 ? `, sent ${inquiry.sendCount} times` : ''}. It can't be undone.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!isConfirmed) return;
    onClose();
    void deleteInquiry(inquiry.saleId, inquiry.id).catch(
      showFailure("Couldn't delete the message"),
    );
  };

  const reach = [
    inquiry.phone === null
      ? null
      : {
          key: 'text',
          href: `sms:${inquiry.phone}`,
          label: 'Text',
          icon: MessageSquare,
        },
    inquiry.phone === null
      ? null
      : {
          key: 'call',
          href: `tel:${inquiry.phone}`,
          label: 'Call',
          icon: Phone,
        },
    inquiry.email === null
      ? null
      : {
          key: 'email',
          href: `mailto:${inquiry.email}`,
          label: 'Email',
          icon: Mail,
        },
  ].filter((link) => link !== null);
  const contactText =
    inquiry.phone === null ? inquiry.email : formatPhone(inquiry.phone);

  const footer = (
    <div className='flex items-center gap-2'>
      {isNew ? (
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='min-w-0 flex-1'
          onClick={handle}
        >
          Mark handled
        </Button>
      ) : (
        <Button
          type='button'
          variant='secondary'
          size='lg'
          rounded='full'
          className='min-w-0 flex-1'
          onClick={onClose}
        >
          Done
        </Button>
      )}
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label='More for this message'
        aria-expanded={isMoreOpen}
        onClick={() => setIsMoreOpen((open) => !open)}
        className={join(
          'text-foreground! size-10 min-w-10 shrink-0 p-0',
          isMoreOpen && 'bg-accent!',
        )}
      >
        <Ellipsis className='size-5' aria-hidden='true' />
      </Button>
    </div>
  );

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={name}
      viewKey={isMoreOpen ? 'more' : 'inquiry'}
      footer={footer}
    >
      {isMoreOpen ? (
        <div className='space-y-5'>
          <BackLink onBack={() => setIsMoreOpen(false)} label={name} />
          <ActionGroup isRoomy>
            {!isNew && (
              <ActionRow
                isGrouped
                isRoomy
                icon={<Undo2 />}
                label='Back to New'
                subtitle='Puts it back on your list to answer'
                onClick={reopen}
              />
            )}
            <ActionRow
              isGrouped
              isRoomy
              isDestructive
              icon={<Trash2 />}
              label='Delete message'
              subtitle='Removes it for you and your co-sellers'
              onClick={() => void remove()}
            />
          </ActionGroup>
        </div>
      ) : (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            {getStatusLine(inquiry, handledBy, now)}
          </p>
          <p className='text-sm font-medium break-words'>{thing}</p>
          <p className='text-sm break-words whitespace-pre-wrap'>
            {inquiry.message ?? 'No message.'}
          </p>
          {reach.length > 0 && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-sm'>Reach {name}</p>
              <div className='flex flex-wrap gap-2'>
                {reach.map((link, index) => (
                  <a
                    key={link.key}
                    href={link.href}
                    className={join(
                      REACH_LINK,
                      index === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'border-border text-foreground border',
                    )}
                  >
                    <link.icon className='size-4' aria-hidden='true' />
                    {link.label}
                  </a>
                ))}
              </div>
              {contactText !== null && (
                <p className='text-muted-foreground text-sm break-all'>
                  {contactText}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </DetailSheet>
  );
}

export default InquiryDrawer;
