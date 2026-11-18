import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import { FACT_STATEMENT_MAX, HELM_COPY } from '@apps/helm/constants';
import {
  addFact,
  type FactSubject,
} from '@apps/helm/store/actions/memoryActions';

interface FactAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  subject: FactSubject;
  name: string;
}

interface FactAddFormProps extends Omit<FactAddSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function FactAddForm({
  subject,
  name,
  onClose,
  requestClose,
  onDirtyChange,
}: FactAddFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [statement, setStatement] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMissing = statement.trim() === '';

  const save = async () => {
    if (!user || isSaving) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsSaving(true);
    try {
      const result = await addFact(user.uid, subject, statement.trim());
      if (result.kind === 'done') {
        onClose();
        addToast({
          title: HELM_COPY.factAddedToast,
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void result.undo().catch((error: unknown) => {
                console.error('Helm fact was not taken back', error);
                addToast({ title: HELM_COPY.editFailed, type: 'error' });
              }),
          },
        });
        return;
      }
      addToast({ title: HELM_COPY.factNeedsConnection, type: 'info' });
    } catch (error) {
      console.error('Helm fact was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsSaving(false);
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-statement`} className='text-sm font-medium'>
          {HELM_COPY.factStatementField}
        </label>
        <Input
          id={`${fieldId}-statement`}
          value={statement}
          maxLength={FACT_STATEMENT_MAX}
          placeholder={HELM_COPY.factStatementPlaceholder(name)}
          autoFocus={canFocusFieldOnOpen()}
          onChange={(event) => {
            setStatement(event.target.value);
            onDirtyChange(event.target.value.trim() !== '');
          }}
        />
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.factStatementHelp}
        </p>
      </div>
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.factStatementMissing : null}
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

/** Adds a fact the person types about one who or place; it is saved as said by them. */
function FactAddSheet({ isOpen, onClose, subject, name }: FactAddSheetProps) {
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
      title={HELM_COPY.factsAddTitle}
    >
      {isOpen && (
        <FactAddForm
          subject={subject}
          name={name}
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

export default FactAddSheet;
