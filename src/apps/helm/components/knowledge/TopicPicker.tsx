import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { MultiPillGroup, type PillOption } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import {
  HELM_COPY,
  NOTE_TOPICS_MAX,
  TOPIC_NAME_MAX,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { createTopic } from '@apps/helm/store/actions/topicActions';
import { selectAllTopics } from '@apps/helm/store/selectors/knowledgeSelectors';
import { pathOf } from '@apps/helm/utils/topicTree';

interface TopicPickerProps {
  values: string[];
  onChange: (values: string[]) => void;
  /** The new topic's name as typed and not yet added; held by the form so unsaved typing counts. */
  pendingName: string;
  onPendingNameChange: (name: string) => void;
}

const createFailure = (kind: string) =>
  kind === 'full' ? HELM_COPY.topicsFull : HELM_COPY.editFailed;

/** The topics a note is filed under: every topic as a pill (a subtopic by its path), up to ten, and "+ New topic" to make one at the top level and pick it. */
function TopicPicker({
  values,
  onChange,
  pendingName: name,
  onPendingNameChange: setName,
}: TopicPickerProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const topics = useAppSelector(selectAllTopics);
  const [isNaming, setIsNaming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const isFull = values.length >= NOTE_TOPICS_MAX;

  const options: PillOption<string>[] = [...topics]
    .sort((left, right) =>
      pathOf(left.id, topics)
        .join(' ')
        .localeCompare(pathOf(right.id, topics).join(' ')),
    )
    .map((topic) => ({
      value: topic.id,
      label:
        topic.depth > 1 ? pathOf(topic.id, topics).join(' › ') : topic.name,
      emoji: topic.emoji ?? undefined,
    }));

  const change = (next: string[]) => {
    if (next.length > NOTE_TOPICS_MAX) return;
    onChange(next);
  };

  const add = async () => {
    if (!user || isBusy || !name.trim()) return;
    setIsBusy(true);
    try {
      const made = await createTopic(
        user.uid,
        await getHelmEncryption(user.uid),
        { name, emoji: null, parentId: null },
        topics,
      );
      if (made.kind !== 'made') {
        addToast({ title: createFailure(made.kind), type: 'info' });
      } else {
        made.written.catch((error: unknown) => {
          console.error('Helm topic was not saved', error);
          addToast({ title: HELM_COPY.editFailed, type: 'error' });
        });
        if (!isFull) change([...values, made.id]);
        setName('');
        setIsNaming(false);
      }
    } catch (error) {
      console.error('Helm topic was not made', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  return (
    <div className='space-y-2'>
      {options.length > 0 && (
        <MultiPillGroup
          label={HELM_COPY.noteTopicsField}
          options={options}
          values={values}
          onChange={change}
        />
      )}
      {isFull && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.topicPickerFull}
        </p>
      )}
      {isNaming ? (
        <div className='flex items-center gap-2'>
          <Input
            id={`${fieldId}-name`}
            className='min-w-0 flex-1'
            aria-label={HELM_COPY.topicPickerNamePlaceholder}
            placeholder={HELM_COPY.topicPickerNamePlaceholder}
            value={name}
            maxLength={TOPIC_NAME_MAX}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void add();
            }}
          />
          <Button
            type='button'
            variant='secondary'
            loading={isBusy}
            disabled={!name.trim()}
            onClick={() => void add()}
          >
            {HELM_COPY.topicAddAction}
          </Button>
          <Button
            type='button'
            variant='tertiary'
            disabled={isBusy}
            onClick={() => {
              setName('');
              setIsNaming(false);
            }}
          >
            {HELM_COPY.editCancel}
          </Button>
        </div>
      ) : (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          rounded='full'
          onClick={() => setIsNaming(true)}
        >
          {HELM_COPY.topicPickerNew}
        </Button>
      )}
    </div>
  );
}

export default TopicPicker;
