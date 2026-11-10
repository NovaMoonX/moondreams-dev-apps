import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import SuggestionChips from '@/components/SuggestionChips';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import { createOptionMatcher } from '@/utils/optionMatchUtils';
import { FACT_STATEMENT_MAX, HELM_COPY, TOPIC_MAX } from '@apps/helm/constants';
import { addFact } from '@apps/helm/store/actions/memoryActions';
import type { FactKind } from '@apps/helm/types';

type SelfKind = Exclude<FactKind, 'world'>;

const KINDS: readonly PillOption<SelfKind>[] = [
  { value: 'identity', label: HELM_COPY.seesYouKindIdentity },
  { value: 'preference', label: HELM_COPY.seesYouKindPreference },
  { value: 'favorite', label: HELM_COPY.seesYouKindFavorite },
];

const topicMatcher = createOptionMatcher({ foldPlurals: true });

interface SelfFactAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selfWhoId: string;
  /** The topics the person's facts already use, by kind, so a new fact files under one. */
  topicsByKind: Record<SelfKind, string[]>;
}

interface SelfFactAddFormProps extends Omit<SelfFactAddSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function SelfFactAddForm({
  selfWhoId,
  topicsByKind,
  onClose,
  requestClose,
  onDirtyChange,
}: SelfFactAddFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const [kind, setKind] = useState<SelfKind>('preference');
  const [statement, setStatement] = useState('');
  const [topic, setTopic] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMissing = statement.trim() === '';
  const hasTopic = kind !== 'identity';
  const suggestions = topicsByKind[kind];

  const save = async () => {
    if (!user || isSaving) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsSaving(true);
    const typed = hasTopic ? topic.trim() : '';
    try {
      const result = await addFact(
        user.uid,
        { kind: 'who', id: selfWhoId },
        statement.trim(),
        {
          kind,
          topic: typed
            ? (topicMatcher.match(typed, suggestions) ?? typed.toLowerCase())
            : null,
        },
      );
      if (result.kind === 'done') {
        onClose();
        addToast({
          title: HELM_COPY.seesYouAddedToast,
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
      <PillGroup
        label={HELM_COPY.seesYouKindField}
        options={KINDS}
        value={kind}
        onChange={setKind}
      />
      <div className='space-y-1.5'>
        <label htmlFor={`${fieldId}-statement`} className='text-sm font-medium'>
          {HELM_COPY.seesYouStatementField}
        </label>
        <Input
          id={`${fieldId}-statement`}
          value={statement}
          maxLength={FACT_STATEMENT_MAX}
          placeholder={HELM_COPY.seesYouStatementPlaceholder[kind]}
          autoFocus={canFocusFieldOnOpen()}
          onChange={(event) => {
            setStatement(event.target.value);
            onDirtyChange(event.target.value.trim() !== '');
          }}
        />
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.seesYouStatementHelp}
        </p>
      </div>
      {hasTopic && (
        <div className='space-y-1.5'>
          <label htmlFor={`${fieldId}-topic`} className='text-sm font-medium'>
            {HELM_COPY.seesYouTopicField}
          </label>
          <Input
            id={`${fieldId}-topic`}
            value={topic}
            maxLength={TOPIC_MAX}
            placeholder={HELM_COPY.seesYouTopicPlaceholder}
            onChange={(event) => setTopic(event.target.value)}
          />
          {suggestions.length > 0 && (
            <SuggestionChips
              label={HELM_COPY.seesYouTopicSuggestions}
              suggestions={suggestions}
              onPick={setTopic}
            />
          )}
        </div>
      )}
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.seesYouStatementMissing : null}
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

/** Adds a preference, a favorite or who the person is to their own record, saved as something they said. */
function SelfFactAddSheet({
  isOpen,
  onClose,
  selfWhoId,
  topicsByKind,
}: SelfFactAddSheetProps) {
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
      title={HELM_COPY.seesYouAddTitle}
    >
      {isOpen && (
        <SelfFactAddForm
          selfWhoId={selfWhoId}
          topicsByKind={topicsByKind}
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

export default SelfFactAddSheet;
