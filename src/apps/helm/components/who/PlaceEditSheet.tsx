import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';

import AppCheckbox from '@/components/AppCheckbox';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { updatePlace } from '@apps/helm/store/actions/placeActions';
import type { OpenPlace } from '@apps/helm/types';

interface PlaceEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  place: OpenPlace;
}

interface PlaceEditFormProps extends Omit<PlaceEditSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const toAliases = (text: string) =>
  text
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean);

function PlaceEditForm({
  place,
  onClose,
  requestClose,
  onDirtyChange,
}: PlaceEditFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [name, setName] = useState(place.name);
  const [aliases, setAliases] = useState(place.aliases.join(', '));
  const [address, setAddress] = useState(place.address ?? '');
  const [isHome, setIsHome] = useState(place.isHome);
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMissing = name.trim() === '';

  const save = async () => {
    if (!user || isSaving) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsSaving(true);
    try {
      const result = await updatePlace(
        user.uid,
        await getHelmEncryption(user.uid),
        place.id,
        {
          name: name.trim(),
          aliases: toAliases(aliases),
          address: address.trim() === '' ? null : address.trim(),
          isHome,
        },
      );
      if (result === 'saved') {
        onClose();
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
      console.error('Helm place was not saved', error);
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
          onChange={(event) => {
            setName(event.target.value);
            onDirtyChange(true);
          }}
        />
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-aliases`} className='text-sm font-medium'>
          {HELM_COPY.whoAliasesField}
        </label>
        <Input
          id={`${fieldId}-aliases`}
          value={aliases}
          onChange={(event) => {
            setAliases(event.target.value);
            onDirtyChange(true);
          }}
        />
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.whoAliasesHelp}
        </p>
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-address`} className='text-sm font-medium'>
          {HELM_COPY.placeAddressField}
        </label>
        <Input
          id={`${fieldId}-address`}
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            onDirtyChange(true);
          }}
        />
      </div>
      <label className='flex min-h-12 items-start gap-3 py-1'>
        <AppCheckbox
          checked={isHome}
          className='mt-0.5'
          onCheckedChange={(checked) => {
            setIsHome(checked);
            onDirtyChange(true);
          }}
        />
        <span className='min-w-0 flex-1'>
          <span className='block text-sm font-medium'>
            {HELM_COPY.placeIsHome}
          </span>
          <span className='text-muted-foreground block text-[13px] text-pretty'>
            {HELM_COPY.placeIsHomeHelp}
          </span>
        </span>
      </label>
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.whoNameMissing : null}
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

/** Change a place's name, other names, address and whether it is home. */
function PlaceEditSheet({ isOpen, onClose, place }: PlaceEditSheetProps) {
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
      title={HELM_COPY.placeEditTitle}
    >
      {isOpen && (
        <PlaceEditForm
          place={place}
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

export default PlaceEditSheet;
