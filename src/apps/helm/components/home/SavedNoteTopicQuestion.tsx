import { useState } from 'react';

import { Button, Input, Select } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import Pill from '@/components/Pill';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY, TOPIC_NAME_MAX } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { fileNoteInTopics } from '@apps/helm/store/actions/noteActions';
import { createTopic } from '@apps/helm/store/actions/topicActions';
import { selectAllTopics } from '@apps/helm/store/selectors/knowledgeSelectors';
import type { OpenNote } from '@apps/helm/types';
import { rankTopicChoices } from '@apps/helm/utils/noteSearch';
import { createRefusal, pathOf } from '@apps/helm/utils/topicTree';

interface SavedNoteTopicQuestionProps {
  note: OpenNote;
  onDone: () => void;
}

const TOP_LEVEL = 'top';

const refusalLine = (kind: string) =>
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
            : HELM_COPY.editFailed;

/** "Which topic should this go in?" for a note saved loose: the likeliest topics as pills, a new topic (a name and an optional parent) and Skip, which leaves it loose. */
function SavedNoteTopicQuestion({ note, onDone }: SavedNoteTopicQuestionProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const topics = useAppSelector(selectAllTopics);
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(TOP_LEVEL);
  const [isBusy, setIsBusy] = useState(false);
  const readable = topics.filter((topic) => !topic.isUnreadable);
  const choices = rankTopicChoices(`${note.title} ${note.body}`, readable);
  const parents = readable
    .filter((topic) => createRefusal(topic.id, readable) === null)
    .map((topic) => ({
      value: topic.id,
      text: pathOf(topic.id, readable).join(' › '),
    }));

  const file = async (topicId: string) => {
    if (!user) return;
    const result = await fileNoteInTopics(user.uid, note.id, [topicId]);
    if (result === 'filed') {
      onDone();
      return;
    }
    addToast({
      title:
        result === 'offline'
          ? HELM_COPY.editNeedsConnection
          : HELM_COPY.savedFilingFailed,
      type: 'info',
    });
  };

  const run = async (step: () => Promise<void>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await step();
    } catch (error) {
      console.error('Helm saved note was not filed', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    }
    setIsBusy(false);
  };

  const addTopic = () =>
    run(async () => {
      if (!user || !name.trim()) return;
      if (!navigator.onLine) {
        addToast({ title: HELM_COPY.editNeedsConnection, type: 'info' });
        return;
      }
      const made = await createTopic(
        user.uid,
        await getHelmEncryption(user.uid),
        {
          name,
          emoji: null,
          parentId: parentId === TOP_LEVEL ? null : parentId,
        },
        topics,
      );
      if (made.kind !== 'made') {
        addToast({ title: refusalLine(made.kind), type: 'info' });
        return;
      }
      await made.written;
      await file(made.id);
    });

  return (
    <div className='flex flex-col gap-2.5'>
      <p className='text-[15px] font-medium'>{HELM_COPY.savedWhichTopic}</p>
      {isNaming ? (
        <div className='flex flex-col gap-2'>
          <Input
            aria-label={HELM_COPY.topicPickerNamePlaceholder}
            placeholder={HELM_COPY.topicPickerNamePlaceholder}
            value={name}
            maxLength={TOPIC_NAME_MAX}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void addTopic();
            }}
          />
          {parents.length > 0 && (
            <div className='flex flex-col gap-1'>
              <span className='text-muted-foreground text-[13px]'>
                {HELM_COPY.savedTopicParent}
              </span>
              <Select
                options={[
                  { value: TOP_LEVEL, text: HELM_COPY.savedTopicTopLevel },
                  ...parents,
                ]}
                value={parentId}
                onChange={setParentId}
              />
            </div>
          )}
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              loading={isBusy}
              disabled={!name.trim()}
              onClick={() => void addTopic()}
            >
              {HELM_COPY.topicAddAction}
            </Button>
            <Button
              type='button'
              variant='tertiary'
              disabled={isBusy}
              onClick={() => {
                setName('');
                setParentId(TOP_LEVEL);
                setIsNaming(false);
              }}
            >
              {HELM_COPY.editCancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className='flex flex-wrap gap-2'>
          {choices.map((topic) => (
            <Pill
              key={topic.id}
              isSelected={false}
              emoji={topic.emoji ?? undefined}
              onClick={() => void run(() => file(topic.id))}
            >
              {topic.name}
            </Pill>
          ))}
          <Pill isSelected={false} onClick={() => setIsNaming(true)}>
            {HELM_COPY.savedNewTopic}
          </Pill>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            rounded='full'
            onClick={onDone}
          >
            {HELM_COPY.savedSkip}
          </Button>
        </div>
      )}
    </div>
  );
}

export default SavedNoteTopicQuestion;
