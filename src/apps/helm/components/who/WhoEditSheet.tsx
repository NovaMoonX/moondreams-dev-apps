import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import ContactListField from '@apps/helm/components/who/ContactListField';
import { HELM_COPY } from '@apps/helm/constants';
import {
  diffContactPoints,
  ensureOnePrimary,
  MAX_CONTACT_POINTS,
  toContactKey,
  toContactLabel,
  type ContactKind,
  type ContactPoint,
} from '@apps/helm/engine/contactPoints';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { updateWho } from '@apps/helm/store/actions/whoActions';
import type { OpenWho, WhoKind } from '@apps/helm/types';

interface WhoEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  who: OpenWho;
}

interface WhoEditFormProps extends Omit<WhoEditSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const KIND_OPTIONS = [
  { value: 'person', label: HELM_COPY.whoKindPerson },
  { value: 'pet', label: HELM_COPY.whoKindPet },
  { value: 'organization', label: HELM_COPY.whoKindOrganization },
] as const;

const keepFilled = (kind: ContactKind, points: ContactPoint[]) =>
  ensureOnePrimary(
    points.flatMap((point) =>
      toContactKey(kind, point.value) === null
        ? []
        : [
            {
              ...point,
              value: point.value.trim().replace(/\s+/g, ' '),
              label: toContactLabel(point.label),
            },
          ],
    ),
  );

const hasRepeat = (kind: ContactKind, points: ContactPoint[]) =>
  new Set(points.map((point) => toContactKey(kind, point.value))).size <
  points.length;

const toNullable = (text: string) => (text.trim() === '' ? null : text.trim());

function WhoEditForm({
  who,
  onClose,
  requestClose,
  onDirtyChange,
}: WhoEditFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [name, setName] = useState(who.name);
  const [kind, setKind] = useState<WhoKind>(who.kind);
  const [relation, setRelation] = useState(who.relation ?? '');
  const [species, setSpecies] = useState(who.species ?? '');
  const [organizationKind, setOrganizationKind] = useState(
    who.organizationKind ?? '',
  );
  const [phones, setPhones] = useState(who.phones);
  const [emails, setEmails] = useState(who.emails);
  const [contactNote, setContactNote] = useState<string | null>(null);
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMissing = name.trim() === '';

  const edit = <T,>(set: (value: T) => void) => {
    return (value: T) => {
      set(value);
      onDirtyChange(true);
    };
  };

  const save = async () => {
    if (!user || isSaving) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    const kept = {
      phones: keepFilled('phone', phones),
      emails: keepFilled('email', emails),
    };
    const repeated = (['phone', 'email'] as const).find((kind) =>
      hasRepeat(kind, kept[kind === 'phone' ? 'phones' : 'emails']),
    );
    if (repeated) {
      setContactNote(HELM_COPY.contactDuplicate(repeated));
      return;
    }
    setContactNote(null);
    setIsSaving(true);
    try {
      const result = await updateWho(
        user.uid,
        await getHelmEncryption(user.uid),
        who.id,
        {
          name: name.trim(),
          kind,
          relation: kind === 'organization' ? null : toNullable(relation),
          species: kind === 'pet' ? toNullable(species) : null,
          organizationKind:
            kind === 'organization' ? toNullable(organizationKind) : null,
          phones: diffContactPoints(who.phones, kept.phones),
          emails: diffContactPoints(who.emails, kept.emails),
        },
      );
      if (result === 'saved') {
        onClose();
        return;
      }
      if (typeof result === 'object') {
        setContactNote(
          result.refusal === 'full'
            ? HELM_COPY.contactFull(MAX_CONTACT_POINTS)
            : result.refusal === 'duplicate'
              ? HELM_COPY.contactDuplicate(result.kind)
              : HELM_COPY.contactEmpty(result.kind),
        );
        setIsSaving(false);
        return;
      }
      addToast({
        title:
          result === 'offline'
            ? HELM_COPY.editNeedsConnection
            : result === 'missing'
              ? HELM_COPY.editGone
              : HELM_COPY.editUnreadable,
        type: 'info',
      });
    } catch (error) {
      console.error('Helm person was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsSaving(false);
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-name`} className='text-sm font-medium'>
          {HELM_COPY.whoNameField}
        </label>
        <Input
          id={`${fieldId}-name`}
          value={name}
          autoFocus={canFocusFieldOnOpen()}
          onChange={(event) => edit(setName)(event.target.value)}
        />
      </div>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.whoKindField}
        </span>
        <PillGroup
          label={HELM_COPY.whoKindField}
          options={KIND_OPTIONS.map((option) => ({ ...option }))}
          value={kind}
          onChange={edit(setKind)}
        />
      </div>
      {kind !== 'organization' && (
        <div className='space-y-1.5'>
          <label
            htmlFor={`${fieldId}-relation`}
            className='text-sm font-medium'
          >
            {HELM_COPY.whoRelationField}
          </label>
          <Input
            id={`${fieldId}-relation`}
            value={relation}
            placeholder={HELM_COPY.whoRelationPlaceholder}
            onChange={(event) => edit(setRelation)(event.target.value)}
          />
        </div>
      )}
      {kind === 'pet' && (
        <div className='space-y-1.5'>
          <label htmlFor={`${fieldId}-species`} className='text-sm font-medium'>
            {HELM_COPY.whoSpeciesField}
          </label>
          <Input
            id={`${fieldId}-species`}
            value={species}
            placeholder={HELM_COPY.whoSpeciesPlaceholder}
            onChange={(event) => edit(setSpecies)(event.target.value)}
          />
        </div>
      )}
      {kind === 'organization' && (
        <div className='space-y-1.5'>
          <label
            htmlFor={`${fieldId}-organization`}
            className='text-sm font-medium'
          >
            {HELM_COPY.whoOrganizationKindField}
          </label>
          <Input
            id={`${fieldId}-organization`}
            value={organizationKind}
            placeholder={HELM_COPY.whoOrganizationKindPlaceholder}
            onChange={(event) => edit(setOrganizationKind)(event.target.value)}
          />
        </div>
      )}
      <ContactListField
        kind='phone'
        points={phones}
        onChange={edit(setPhones)}
      />
      <ContactListField
        kind='email'
        points={emails}
        onChange={edit(setEmails)}
      />
      <ModalFooterActions
        note={
          contactNote ??
          (isTouched && isMissing ? HELM_COPY.whoNameMissing : null)
        }
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isSaving} onClick={() => void save()}>
            {HELM_COPY.editSave}
          </Button>
        }
      />
    </div>
  );
}

/** Change a person, pet or organization's name, kind, how they relate and contact details. */
function WhoEditSheet({ isOpen, onClose, who }: WhoEditSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: () => {
      setIsDirty(false);
      onClose();
    },
  });

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={HELM_COPY.whoEditTitle}
    >
      {isOpen && (
        <WhoEditForm
          who={who}
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

export default WhoEditSheet;
