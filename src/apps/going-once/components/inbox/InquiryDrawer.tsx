import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Ellipsis,
  Mail,
  MessageSquare,
  Phone,
  Trash2,
  Undo2,
} from 'lucide-react';

import { useAppSelector } from '@/store';
import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DetailSheet from '@/components/DetailSheet';
import ClampedText from '@/components/ClampedText';
import {
  backToNew,
  deleteInquiry,
  markHandled,
} from '@apps/going-once/store/actions/inquiryActions';
import { formatDateShort } from '@/utils/formatUtils';
import StatusDot from '@apps/going-once/components/things/StatusDot';
import ThingThumb from '@apps/going-once/components/things/ThingThumb';
import { selectIsSaleFinished } from '@apps/going-once/store/selectors';
import type { Inquiry, Item } from '@apps/going-once/types';
import {
  getAvailableLabel,
  getItemName,
  isListable,
} from '@apps/going-once/utils/listing';
import { getStatusFacts } from '@apps/going-once/utils/status';
import { formatPhone } from '@apps/going-once/utils/contact';
import {
  formatSentAt,
  getInquirerName,
} from '@apps/going-once/utils/inquiries';

interface InquiryDrawerProps {
  inquiry: Inquiry;
  uid: string;
  /** The thing it is about, which the thing's row opens; `null` once it is gone. */
  item: Item | null;
  onOpenThing: () => void;
  /** Opens the thing's Mark pending, held for this person. */
  onHold: () => void;
  thing: string;
  handledBy: string | null;
  now: number;
  /** When the sale's finish will clear buyers' details, or `null` when it isn't waiting to. */
  clearsAt: number | null;
  onClose: () => void;
  onBackToNew: () => void;
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
    return ['New', resent ?? formatSentAt(inquiry.lastSentAt, now)].join(' · ');
  return [
    `Handled by ${handledBy ?? 'someone'} · ${formatSentAt(inquiry.handledAt, now)}`,
    resent,
  ]
    .filter((part) => part !== null)
    .join(' · ');
};

/** The buyer's words as a message from them: a small caption, then a bubble squared toward it. */
function MessageBubble({
  caption,
  message,
}: {
  caption: string;
  message: string;
}) {
  return (
    <div className='max-w-[85%] space-y-1'>
      <p className='text-muted-foreground px-1 text-xs'>{caption}</p>
      <div className='bg-muted rounded-2xl rounded-tl-sm px-4 py-3'>
        <ClampedText text={message} maxLines={8} isBodySize />
      </div>
    </div>
  );
}

/** One inquiry in full: the message, the ways to reach the person as native links, and Mark handled; Back to New and Delete sit behind More. */
function InquiryDrawer({
  inquiry,
  uid,
  item,
  onOpenThing,
  onHold,
  thing,
  handledBy,
  now,
  clearsAt,
  onClose,
  onBackToNew,
}: InquiryDrawerProps) {
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const name = getInquirerName(inquiry, thing);
  const clearedAt = inquiry.contactClearedAt;
  const isSaleFinished = useAppSelector((state) =>
    selectIsSaleFinished(state, inquiry.saleId),
  );
  const isNew = inquiry.status === 'NEW';

  const showFailure = (title: string) => () =>
    addToast({
      title,
      description: 'Check your connection and try again.',
      type: 'error',
    });

  const handle = () => {
    onClose();
    void markHandled(inquiry.saleId, inquiry.id, uid).catch(
      showFailure("Couldn't mark it handled"),
    );
  };
  const reopen = () => {
    setIsMoreOpen(false);
    void backToNew(inquiry.saleId, inquiry.id).catch(
      showFailure("Couldn't move it back to New"),
    );
    onBackToNew();
  };
  const remove = async () => {
    const isConfirmed = await confirm({
      title:
        clearedAt === null
          ? `Delete ${name}'s message?`
          : 'Delete this message?',
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
        <div className='space-y-5'>
          <p className='text-muted-foreground flex items-center gap-2 text-sm'>
            {isNew ? (
              <span
                className='bg-primary size-2 shrink-0 rounded-full'
                aria-hidden='true'
              />
            ) : (
              <CheckCircle2 className='size-4 shrink-0' aria-hidden='true' />
            )}
            <span className='min-w-0'>
              {getStatusLine(inquiry, handledBy, now)}
            </span>
          </p>
          {inquiry.message === null ? (
            <p className='text-muted-foreground'>No message.</p>
          ) : (
            <MessageBubble
              caption={`${name} wrote · ${formatSentAt(inquiry.lastSentAt, now)}`}
              message={inquiry.message}
            />
          )}
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs font-medium'>About</p>
            {item === null ? (
              <p className='text-muted-foreground text-sm break-words'>
                {thing}
              </p>
            ) : (
              <Button
                type='button'
                variant='tertiary'
                className='border-border bg-card h-auto min-h-16 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left'
                aria-label={`Open ${getItemName(item)}`}
                onClick={onOpenThing}
              >
                <ThingThumb item={item} />
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground line-clamp-2 text-base font-medium break-words'>
                    {getItemName(item)}
                  </span>
                  <span className='text-muted-foreground block text-sm font-normal'>
                    <StatusDot
                      status={item.status}
                      label={
                        item.status === 'AVAILABLE'
                          ? getAvailableLabel(item, isSaleFinished)
                          : undefined
                      }
                      isInline
                    >
                      {getStatusFacts(item, true)}
                    </StatusDot>
                  </span>
                </span>
                <ChevronRight
                  className='text-muted-foreground size-5 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            )}
            {!isSaleFinished &&
              clearedAt === null &&
              item !== null &&
              item.status === 'AVAILABLE' &&
              isListable(item) && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className='text-primary! h-10 max-w-full justify-start gap-2 px-2!'
                  onClick={onHold}
                >
                  <CalendarClock
                    className='size-4 shrink-0'
                    aria-hidden='true'
                  />
                  <span className='truncate'>Hold it for {name}</span>
                </Button>
              )}
          </div>
          {clearedAt !== null && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-xs font-medium'>
                Reach them
              </p>
              <p className='text-muted-foreground text-sm'>
                Details cleared {formatDateShort(clearedAt)}.
              </p>
            </div>
          )}
          {reach.length > 0 && (
            <div className='space-y-2'>
              <p className='text-muted-foreground text-xs font-medium'>
                Reach them
              </p>
              {contactText !== null && (
                <p className='text-muted-foreground text-sm break-all'>
                  {contactText}
                </p>
              )}
              <div className='flex flex-wrap gap-2'>
                {reach.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    className={join(
                      REACH_LINK,
                      'border-border text-foreground border',
                    )}
                  >
                    <link.icon className='size-4' aria-hidden='true' />
                    {link.label}
                  </a>
                ))}
              </div>
              {clearsAt !== null && (
                <p className='text-muted-foreground text-xs'>
                  Buyers&apos; details clear {formatDateShort(clearsAt)}.
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
