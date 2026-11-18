import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus, X } from 'lucide-react';

import { generateUuid } from '@/utils/idUtils';
import ContactLabelPicker from '@apps/helm/components/who/ContactLabelPicker';
import { HELM_COPY } from '@apps/helm/constants';
import {
  MAX_CONTACT_POINTS,
  defaultLabelFor,
  ensureOnePrimary,
  makePrimaryContactPoint,
  type ContactKind,
  type ContactPoint,
} from '@apps/helm/engine/contactPoints';

interface ContactListFieldProps {
  kind: ContactKind;
  /** The draft list: an entry still being typed may hold no value yet. */
  points: ContactPoint[];
  onChange: (points: ContactPoint[]) => void;
}

const isPhone = (kind: ContactKind) => kind === 'phone';

/** A list of phones or emails in the edit sheet: add, label, make primary and remove, each entry with its own value. Removing the primary makes the next one primary. */
function ContactListField({ kind, points, onChange }: ContactListFieldProps) {
  const update = (id: string, patch: Partial<ContactPoint>) =>
    onChange(
      points.map((point) => (point.id === id ? { ...point, ...patch } : point)),
    );

  return (
    <div className='space-y-2'>
      <span className='block text-sm font-medium'>
        {isPhone(kind)
          ? HELM_COPY.contactEditPhones
          : HELM_COPY.contactEditEmails}
      </span>
      {points.map((point) => (
        <div
          key={point.id}
          className='border-border space-y-2 rounded-xl border p-3'
        >
          <div className='flex items-center gap-2'>
            <Input
              aria-label={
                isPhone(kind)
                  ? HELM_COPY.contactPhoneField
                  : HELM_COPY.contactEmailField
              }
              className='min-w-0 flex-1'
              type={isPhone(kind) ? 'tel' : 'email'}
              value={point.value}
              placeholder={
                isPhone(kind)
                  ? HELM_COPY.contactNumberPlaceholder
                  : HELM_COPY.contactAddressPlaceholder
              }
              onChange={(event) =>
                update(point.id, { value: event.target.value })
              }
            />
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='shrink-0'
              aria-label={HELM_COPY.contactRemoveEntry(point.value)}
              onClick={() =>
                onChange(
                  ensureOnePrimary(
                    points.filter((entry) => entry.id !== point.id),
                  ),
                )
              }
            >
              <X className='size-4' aria-hidden='true' />
            </Button>
          </div>
          <ContactLabelPicker
            kind={kind}
            label={point.label}
            onChange={(label) => update(point.id, { label })}
          />
          {point.isPrimary ? (
            <p className='text-muted-foreground text-[13px]'>
              {HELM_COPY.contactPrimary}
            </p>
          ) : (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='self-start !px-0'
              onClick={() =>
                onChange(makePrimaryContactPoint(points, point.id))
              }
            >
              {HELM_COPY.contactMakePrimary}
            </Button>
          )}
        </div>
      ))}
      {points.length < MAX_CONTACT_POINTS && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='text-muted-foreground'
          onClick={() =>
            onChange([
              ...points,
              {
                id: generateUuid(),
                value: '',
                label: defaultLabelFor(kind),
                isPrimary: points.length === 0,
              },
            ])
          }
        >
          <Plus className='size-4' aria-hidden='true' />
          {isPhone(kind)
            ? HELM_COPY.contactAddPhone
            : HELM_COPY.contactAddEmail}
        </Button>
      )}
    </div>
  );
}

export default ContactListField;
