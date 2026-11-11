import { useId, useState } from 'react';

import {
  Button,
  Input,
  RadioGroup,
  RadioGroupItem,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import {
  ASSISTANT_TONES,
  DEFAULT_ASSISTANT_NAME,
  HELM_COPY,
} from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useAssistantTone } from '@apps/helm/hooks/useAssistantTone';
import { setAssistantNameAndTone } from '@apps/helm/store/actions/settingsActions';
import type { AssistantTone } from '@apps/helm/types';
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
  const [text, setText] = useState(
    savedName === DEFAULT_ASSISTANT_NAME ? '' : savedName,
  );
  const [tone, setTone] = useState<AssistantTone>(savedTone);
  const [isSaving, setIsSaving] = useState(false);
  const typedName = readAssistantName(text);
  const isNameValid = text.trim() === '' || typedName !== null;
  const nextName = typedName ?? DEFAULT_ASSISTANT_NAME;

  const change = (nextText: string, nextTone: AssistantTone) => {
    setText(nextText);
    setTone(nextTone);
    onDirtyChange(
      (readAssistantName(nextText) ?? DEFAULT_ASSISTANT_NAME) !== savedName ||
        nextTone !== savedTone,
    );
  };

  const save = async () => {
    if (!user || !isNameValid || isSaving) return;
    setIsSaving(true);
    try {
      await setAssistantNameAndTone(
        user.uid,
        nextName === DEFAULT_ASSISTANT_NAME ? null : nextName,
        tone,
      );
      onSaved();
    } catch (error) {
      console.error('Helm assistant name and tone were not saved', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-name`} className='text-sm font-medium'>
          {HELM_COPY.assistantNameLabel}
        </label>
        <Input
          id={`${fieldId}-name`}
          variant='outline'
          className='helm-field'
          placeholder={DEFAULT_ASSISTANT_NAME}
          value={text}
          autoComplete='off'
          errorMessage={isNameValid ? undefined : HELM_COPY.assistantNameError}
          onChange={(event) => change(event.target.value, tone)}
        />
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.assistantNameHint}
        </p>
        {text !== '' && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            onClick={() => change('', tone)}
            disabled={isSaving}
          >
            {HELM_COPY.assistantUseDefault}
          </Button>
        )}
      </div>
      <div className='space-y-2'>
        <p className='text-sm font-medium'>{HELM_COPY.assistantToneLabel}</p>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.assistantToneHint}
        </p>
        <RadioGroup
          value={tone}
          onChange={(value) => change(text, value as AssistantTone)}
          className='grid gap-2'
        >
          {ASSISTANT_TONES.map((option) => (
            <RadioGroupItem
              key={option.value}
              value={option.value}
              hideInput
              disabled={isSaving}
              className={join(
                'rounded-xl !border px-3 py-2.5 text-left transition-none focus-within:!border-solid',
                tone === option.value
                  ? '!border-primary bg-primary/5'
                  : 'bg-card !border-border',
              )}
            >
              <span className='flex flex-col items-start gap-0.5'>
                <span className='text-sm font-medium'>{option.label}</span>
                <span className='text-muted-foreground text-[13px] text-pretty'>
                  {option.sample}
                </span>
              </span>
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </div>
      <ModalFooterActions
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.talkCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            onClick={() => void save()}
            loading={isSaving}
            disabled={!isNameValid}
          >
            {HELM_COPY.assistantSave}
          </Button>
        }
      />
    </div>
  );
}

/** Your assistant: the name it answers to and how its answers sound. */
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
