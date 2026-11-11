import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import { HELM_COPY, TOPIC_NAME_MAX } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  createTopic,
  renameTopic,
  type TopicMade,
} from '@apps/helm/store/actions/topicActions';
import { selectAllTopics } from '@apps/helm/store/selectors/knowledgeSelectors';
import type { OpenTopic } from '@apps/helm/types';

interface TopicFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The topic being renamed; null makes a new one. */
  topic: OpenTopic | null;
  /** Where a new topic goes: null for the top level. */
  parentId: string | null;
}

interface TopicFormProps extends Omit<TopicFormSheetProps, 'isOpen'> {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const toFirstEmoji = (text: string) =>
  Array.from(new Intl.Segmenter().segment(text.trim()))[0]?.segment ?? '';

const refusalLine = (kind: Exclude<TopicMade['kind'], 'made'>) =>
  kind === 'offline'
    ? HELM_COPY.editNeedsConnection
    : kind === 'full'
      ? HELM_COPY.topicsFull
      : kind === 'tooMany'
        ? HELM_COPY.topicSubsFull
        : kind === 'tooDeep'
          ? HELM_COPY.topicTooDeep
          : kind === 'missing'
            ? HELM_COPY.topicGone
            : HELM_COPY.topicNameMissing;

function TopicForm({
  topic,
  parentId,
  onClose,
  requestClose,
  onDirtyChange,
}: TopicFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const topics = useAppSelector(selectAllTopics);
  const [name, setName] = useState(topic?.name ?? '');
  const [emoji, setEmoji] = useState(topic?.emoji ?? '');
  const [isTouched, setIsTouched] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const isMissing = name.trim() === '';

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      onDirtyChange(true);
    };

  const save = async () => {
    if (!user || isBusy) return;
    if (isMissing) {
      setIsTouched(true);
      return;
    }
    setIsBusy(true);
    try {
      const encryption = await getHelmEncryption(user.uid);
      const words = { name, emoji: emoji || null };
      if (topic) {
        const result = await renameTopic(user.uid, encryption, topic.id, words);
        if (result === 'saved') {
          addToast({
            title: HELM_COPY.topicSavedToast(name.trim()),
            type: 'success',
          });
          onClose();
          return;
        }
        addToast({
          title:
            result === 'offline'
              ? HELM_COPY.editNeedsConnection
              : result === 'missing'
                ? HELM_COPY.topicGone
                : HELM_COPY.topicUnreadable,
          type: 'info',
        });
      } else {
        const result = await createTopic(
          user.uid,
          encryption,
          { ...words, parentId },
          topics,
        );
        if (result.kind === 'made') {
          result.written.catch((error: unknown) => {
            console.error('Helm topic was not saved', error);
            addToast({ title: HELM_COPY.editFailed, type: 'error' });
          });
          addToast({
            title: HELM_COPY.topicMadeToast(name.trim()),
            type: 'success',
          });
          onClose();
          return;
        }
        addToast({ title: refusalLine(result.kind), type: 'info' });
      }
    } catch (error) {
      console.error('Helm topic was not saved', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-start gap-3'>
        <div className='space-y-1.5'>
          <p className='text-sm font-medium'>{HELM_COPY.topicEmojiField}</p>
          <EmojiField
            value={emoji}
            ariaLabel={HELM_COPY.topicEmojiField}
            onChange={(value) => edit(setEmoji)(toFirstEmoji(value))}
          />
        </div>
        <div className='min-w-0 flex-1 space-y-1.5'>
          <label htmlFor={`${fieldId}-name`} className='text-sm font-medium'>
            {HELM_COPY.topicNameField}
          </label>
          <Input
            id={`${fieldId}-name`}
            value={name}
            maxLength={TOPIC_NAME_MAX}
            placeholder={HELM_COPY.topicNamePlaceholder}
            autoFocus={canFocusFieldOnOpen()}
            onChange={(event) => edit(setName)(event.target.value)}
          />
        </div>
      </div>
      <ModalFooterActions
        note={isTouched && isMissing ? HELM_COPY.topicNameMissing : null}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isBusy}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isBusy} onClick={() => void save()}>
            {topic ? HELM_COPY.editSave : HELM_COPY.topicAddAction}
          </Button>
        }
      />
    </div>
  );
}

/** Make a topic (at the top or under another) or change one's name and emoji. */
function TopicFormSheet({
  isOpen,
  onClose,
  topic,
  parentId,
}: TopicFormSheetProps) {
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
      title={
        topic
          ? HELM_COPY.topicMenuRename
          : parentId
            ? HELM_COPY.topicSubAddTitle
            : HELM_COPY.topicAddTitle
      }
    >
      {isOpen && (
        <TopicForm
          topic={topic}
          parentId={parentId}
          onClose={close}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default TopicFormSheet;
