import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Copy,
  MessageSquare,
  Pencil,
  Phone,
  Star,
  Trash2,
  Mail,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { toDialableNumber, toMailtoUrl } from '@/utils/contactUtils';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import { generateUuid } from '@/utils/idUtils';
import ContactLabelPicker from '@apps/helm/components/who/ContactLabelPicker';
import { HELM_COPY } from '@apps/helm/constants';
import {
  defaultLabelFor,
  MAX_CONTACT_POINTS,
  type ContactKind,
  type ContactPoint,
} from '@apps/helm/engine/contactPoints';
import { filterPrivateOwnPage } from '@apps/helm/utils/privacy';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  setWhoContacts,
  type ContactChange,
} from '@apps/helm/store/actions/whoActions';

interface ContactPointSheetProps {
  isOpen: boolean;
  onClose: () => void;
  whoId: string;
  kind: ContactKind;
  /** The entry the sheet is for; null while adding one. */
  point: ContactPoint | null;
  /** The kind's whole list in its stored order, for where an Undo puts an entry back. */
  points: ContactPoint[];
  isMissing: boolean;
}

interface BodyProps extends Omit<ContactPointSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const open = (url: string) => window.open(url, '_self');

function ContactPointBody({
  onClose,
  whoId,
  kind,
  point,
  points,
  isMissing,
  requestClose,
  onDirtyChange,
}: BodyProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isEditing, setIsEditing] = useState(point === null);
  const [value, setValue] = useState(point?.value ?? '');
  const [label, setLabel] = useState(point?.label ?? defaultLabelFor(kind));
  const [note, setNote] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const toNote = (
    result: Exclude<Awaited<ReturnType<typeof setWhoContacts>>, 'saved'>,
  ) =>
    result === 'offline'
      ? HELM_COPY.editNeedsConnection
      : result === 'missing'
        ? HELM_COPY.editGone
        : result === 'unreadable'
          ? HELM_COPY.editUnreadable
          : result === 'duplicate'
            ? HELM_COPY.contactDuplicate(kind)
            : result === 'full'
              ? HELM_COPY.contactFull(MAX_CONTACT_POINTS)
              : HELM_COPY.contactEmpty(kind);

  const write = async (change: ContactChange) => {
    if (!user) return false;
    setIsBusy(true);
    setNote(null);
    try {
      const result = await setWhoContacts(
        user.uid,
        await getHelmEncryption(user.uid),
        whoId,
        kind,
        change,
      );
      if (result === 'saved') return true;
      setNote(toNote(result));
    } catch (error) {
      console.error('Helm contact was not saved', error);
      setNote(HELM_COPY.editFailed);
    } finally {
      setIsBusy(false);
    }
    return false;
  };

  const save = async () => {
    if (isBusy) return;
    const isDone = await write(
      point
        ? { kind: 'change', id: point.id, value, label }
        : { kind: 'add', id: generateUuid(), value, label },
    );
    if (isDone) {
      onDirtyChange(false);
      onClose();
    }
  };

  const copy = async () => {
    if (!point) return;
    // check:helm-copy requires the filter in a copying file; a tap on the entry's own sheet always copies.
    const own = filterPrivateOwnPage(point, () => false) ?? point;
    addToast({
      title: (await copyToClipboard(own.value))
        ? HELM_COPY.contactCopied
        : HELM_COPY.contactCopyFailed,
      type: 'info',
    });
  };

  const makePrimary = async () => {
    if (!point || isBusy) return;
    if (!(await write({ kind: 'primary', id: point.id }))) return;
    addToast({
      title: HELM_COPY.contactMadePrimaryToast(point.value),
      type: 'info',
    });
    onClose();
  };

  const undoRemove = async (removed: ContactPoint, index: number) => {
    if (!user) return;
    try {
      const result = await setWhoContacts(
        user.uid,
        await getHelmEncryption(user.uid),
        whoId,
        kind,
        { kind: 'restore', point: removed, index },
      );
      if (result !== 'saved')
        addToast({ title: toNote(result), type: 'error' });
    } catch (error) {
      console.error('Helm contact was not restored', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
  };

  const remove = async () => {
    if (!point || isBusy) return;
    const index = points.findIndex((entry) => entry.id === point.id);
    if (!(await write({ kind: 'remove', id: point.id }))) return;
    onClose();
    addToast({
      title: HELM_COPY.contactRemovedToast(point.value),
      type: 'info',
      action: {
        label: HELM_COPY.undo,
        onClick: () => void undoRemove(point, index),
      },
    });
  };

  if (isMissing) {
    return (
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.editGone}
      </p>
    );
  }

  if (!isEditing && point) {
    return (
      <div className='space-y-4'>
        <div className='min-w-0'>
          <p className='text-[17px] font-medium break-words'>{point.value}</p>
          <p className='text-muted-foreground text-[15px]'>
            {point.isPrimary
              ? `${point.label} · ${HELM_COPY.contactPrimary}`
              : point.label}
          </p>
        </div>
        {note && <p className='text-destructive text-sm'>{note}</p>}
        <ActionGroup>
          {kind === 'phone' && (
            <>
              <ActionRow
                isGrouped
                icon={<Phone />}
                label={HELM_COPY.contactCall}
                onClick={() => open(`tel:${toDialableNumber(point.value)}`)}
              />
              <ActionRow
                isGrouped
                icon={<MessageSquare />}
                label={HELM_COPY.contactText}
                onClick={() => open(`sms:${toDialableNumber(point.value)}`)}
              />
            </>
          )}
          {kind === 'email' && (
            <ActionRow
              isGrouped
              icon={<Mail />}
              label={HELM_COPY.contactWriteEmail}
              onClick={() => open(toMailtoUrl(point.value))}
            />
          )}
          <ActionRow
            isGrouped
            icon={<Copy />}
            label={HELM_COPY.contactCopy}
            subtitle={HELM_COPY.contactCopySubtitle}
            onClick={() => void copy()}
          />
          {!point.isPrimary && (
            <ActionRow
              isGrouped
              icon={<Star />}
              label={HELM_COPY.contactMakePrimary}
              subtitle={HELM_COPY.contactMakePrimarySubtitle}
              isDisabled={isBusy}
              onClick={() => void makePrimary()}
            />
          )}
          <ActionRow
            isGrouped
            icon={<Pencil />}
            label={HELM_COPY.contactChange}
            subtitle={HELM_COPY.contactChangeSubtitle}
            hasChevron
            onClick={() => setIsEditing(true)}
          />
          <ActionRow
            isGrouped
            isDestructive
            icon={<Trash2 />}
            label={HELM_COPY.contactRemove}
            subtitle={HELM_COPY.contactRemoveSubtitle}
            isDisabled={isBusy}
            onClick={() => void remove()}
          />
        </ActionGroup>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {kind === 'phone'
            ? HELM_COPY.contactPhoneField
            : HELM_COPY.contactEmailField}
        </span>
        <Input
          aria-label={
            kind === 'phone'
              ? HELM_COPY.contactPhoneField
              : HELM_COPY.contactEmailField
          }
          type={kind === 'phone' ? 'tel' : 'email'}
          value={value}
          autoFocus={canFocusFieldOnOpen()}
          onChange={(event) => {
            setValue(event.target.value);
            onDirtyChange(true);
          }}
        />
      </div>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.contactLabelField}
        </span>
        <ContactLabelPicker
          label={label}
          onChange={(next) => {
            setLabel(next);
            onDirtyChange(true);
          }}
        />
      </div>
      <ModalFooterActions
        note={note}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            disabled={isBusy}
            onClick={
              point
                ? () => {
                    setValue(point.value);
                    setLabel(point.label);
                    setNote(null);
                    onDirtyChange(false);
                    setIsEditing(false);
                  }
                : requestClose
            }
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isBusy} onClick={() => void save()}>
            {HELM_COPY.contactSave}
          </Button>
        }
      />
    </div>
  );
}

/** One phone or email's actions (Call or Text, Email, Copy, Make primary, Change, Remove with Undo), or the form that adds one. */
function ContactPointSheet({
  isOpen,
  onClose,
  ...rest
}: ContactPointSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: () => {
      setIsDirty(false);
      onClose();
    },
  });
  const { kind, point } = rest;

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={
        kind === 'phone'
          ? point
            ? HELM_COPY.contactPhoneTitle
            : HELM_COPY.contactNewPhoneTitle
          : point
            ? HELM_COPY.contactEmailTitle
            : HELM_COPY.contactNewEmailTitle
      }
    >
      {isOpen && (
        <ContactPointBody
          {...rest}
          onClose={() => {
            setIsDirty(false);
            onClose();
          }}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default ContactPointSheet;
