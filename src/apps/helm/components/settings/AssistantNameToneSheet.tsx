import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import { DEFAULT_ASSISTANT_NAME, HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useAssistantTone } from '@apps/helm/hooks/useAssistantTone';
import { setAssistantNameAndTone } from '@apps/helm/store/actions/settingsActions';
import { readAssistantName } from '@apps/helm/utils/assistantName';

interface AssistantNameToneSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AssistantFormProps {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: () => void;
}

function AssistantForm({
  requestClose,
  onDirtyChange,
  onSaved,
}: AssistantFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const savedName = useAssistantName();
  const savedTone = useAssistantTone();
  const assistants = useAppSelector((state) => state.helm.assistants.items);
  const [text, setText] = useState(
    savedName === DEFAULT_ASSISTANT_NAME ? '' : savedName,
  );
  const typedName = readAssistantName(text);
  const isNameValid = text.trim() === '' || typedName !== null;
  const nextName = typedName ?? DEFAULT_ASSISTANT_NAME;

  const change = (nextText: string) => {
    setText(nextText);
    onDirtyChange(
      (readAssistantName(nextText) ?? DEFAULT_ASSISTANT_NAME) !== savedName,
    );
  };

  const save = () => {
    if (!user || !isNameValid) return;
    setAssistantNameAndTone(
      user.uid,
      nextName === DEFAULT_ASSISTANT_NAME ? null : nextName,
      savedTone,
      nextName !== savedName,
    ).catch((error) => {
      console.error('Helm assistant name was not saved', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
    onSaved();
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-1.5'>
        <div className='flex min-h-7 items-center justify-between gap-3'>
          <label htmlFor={`${fieldId}-name`} className='text-sm font-medium'>
            {HELM_COPY.assistantNameLabel}
          </label>
          {text !== '' && nextName !== DEFAULT_ASSISTANT_NAME && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className='relative -mr-2 after:absolute after:inset-x-0 after:-inset-y-1.5'
              onClick={() => change('')}
            >
              {HELM_COPY.assistantUseDefault(DEFAULT_ASSISTANT_NAME)}
            </Button>
          )}
        </div>
        <Input
          id={`${fieldId}-name`}
          variant='outline'
          className='helm-field'
          placeholder={DEFAULT_ASSISTANT_NAME}
          value={text}
          autoComplete='off'
          errorMessage={isNameValid ? undefined : HELM_COPY.assistantNameError}
          onChange={(event) => change(event.target.value)}
        />
        {isNameValid && (
          <p
            className='text-muted-foreground text-[13px] text-pretty'
            role='status'
          >
            {assistants.length > 0 && nextName !== savedName
              ? HELM_COPY.assistantRenameConnected(nextName)
              : HELM_COPY.assistantNameHint}
          </p>
        )}
      </div>
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='tertiary' onClick={requestClose}>
            {HELM_COPY.talkCancel}
          </Button>
        }
        rightActions={
          <Button type='button' onClick={save} disabled={!isNameValid}>
            {HELM_COPY.assistantSave}
          </Button>
        }
      />
    </div>
  );
}

/** Your assistant: the name it answers to. */
function AssistantNameToneSheet({
  isOpen,
  onClose,
}: AssistantNameToneSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const close = () => {
    setIsDirty(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={HELM_COPY.assistantSheetTitle}
    >
      {isOpen && (
        <AssistantForm
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
          onSaved={close}
        />
      )}
    </FormSheet>
  );
}

export default AssistantNameToneSheet;
