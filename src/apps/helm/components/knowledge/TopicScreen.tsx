import { useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Plus } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { store, useAppSelector } from '@/store';
import NoteForm from '@apps/helm/components/knowledge/NoteForm';
import NoteRow from '@apps/helm/components/knowledge/NoteRow';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import TopicFormSheet from '@apps/helm/components/knowledge/TopicFormSheet';
import TopicMoveSheet from '@apps/helm/components/knowledge/TopicMoveSheet';
import TopicRow from '@apps/helm/components/knowledge/TopicRow';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  deleteTopic,
  isUnavailable,
  moveTopic,
  TopicDeletePartialError,
  type TopicMove,
} from '@apps/helm/store/actions/topicActions';
import {
  selectAllTopics,
  selectNotesByTopic,
  selectSubtopicsByParent,
  selectTopicById,
} from '@apps/helm/store/selectors/knowledgeSelectors';
import {
  createRefusal,
  legalParents,
  moveRefusal,
  pathOf,
} from '@apps/helm/utils/topicTree';

const { option } = DropdownMenuFactories;

interface TopicScreenProps {
  topicId: string | null;
  onBack: () => void;
  onHome: () => void;
  onOpenTopic: (topicId: string) => void;
  /** Back to the parent topic, popping when the person came from it. */
  onOpenParent: (topicId: string) => void;
}

const moveFailure = (kind: Exclude<TopicMove['kind'], 'moved'>) =>
  kind === 'offline'
    ? HELM_COPY.editNeedsConnection
    : kind === 'changed' || kind === 'missing'
      ? HELM_COPY.topicChanged
      : kind === 'tooDeep'
        ? HELM_COPY.topicTooDeep
        : kind === 'tooMany'
          ? HELM_COPY.topicSubsFull
          : HELM_COPY.topicMoveRefused;

/** One topic: its path, how much it holds, its subtopics and its notes, with a menu to rename, add under, move or delete it. */
function TopicScreen({
  topicId,
  onBack,
  onHome,
  onOpenTopic,
  onOpenParent,
}: TopicScreenProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const isLoaded = useAppSelector((state) => state.helm.topics.isLoaded);
  const topics = useAppSelector(selectAllTopics);
  const topic = useAppSelector(selectTopicById).get(topicId ?? '') ?? null;
  const subtopics = useAppSelector(selectSubtopicsByParent).get(topicId ?? '');
  const notes = useAppSelector(selectNotesByTopic).get(topicId ?? '') ?? [];
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [isMakingNote, setIsMakingNote] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isAddingSub, setIsAddingSub] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const parent = topic?.parentId
    ? (topics.find((entry) => entry.id === topic.parentId) ?? null)
    : null;
  const leave = () => (parent ? onOpenParent(parent.id) : onBack());
  const subtopicList = [...(subtopics ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );

  useScreenContext('topic', null, [], {
    ask: topic ? HELM_COPY.askTopic : HELM_COPY.askKnowledge,
    chip: topic ? HELM_COPY.chipTopic(topic.name) : HELM_COPY.chipKnowledge,
    back: topic ? HELM_COPY.backToTopic(topic.name) : HELM_COPY.backToKnowledge,
  });

  const reportFailure = (error: unknown) => {
    console.error('Helm topic was not changed', error);
    addToast({ title: HELM_COPY.editFailed, type: 'error' });
  };

  const move = async (parentId: string | null) => {
    if (!user || !topic) return;
    setIsMoving(false);
    try {
      const result = await moveTopic(user.uid, topic.id, parentId, topics);
      if (result.kind !== 'moved') {
        addToast({ title: moveFailure(result.kind), type: 'info' });
        return;
      }
      addToast({
        title: HELM_COPY.topicMoveToast(
          topic.name,
          parentId === null
            ? null
            : (topics.find((entry) => entry.id === parentId)?.name ?? null),
        ),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void result.undo().then(
              (undone) => {
                if (undone.kind !== 'moved') {
                  addToast({ title: HELM_COPY.undoChangedSince, type: 'info' });
                }
              },
              (error: unknown) => {
                console.error('Helm topic was not moved back', error);
                addToast({ title: HELM_COPY.topicUndoFailed, type: 'error' });
              },
            ),
        },
      });
    } catch (error) {
      reportFailure(error);
    }
  };

  const remove = async () => {
    if (!user || !topic) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.topicDeleteNeedsConnection, type: 'info' });
      return;
    }
    const isConfirmed = await confirm({
      title: HELM_COPY.topicDeleteTitle(topic.name),
      message: HELM_COPY.topicDeleteConfirm(
        topic.name,
        subtopicList.length,
        notes.length,
        parent?.name ?? null,
      ),
      confirmText: HELM_COPY.topicDeleteAction,
      destructive: true,
    });
    if (!isConfirmed) return;
    try {
      const { restore } = await deleteTopic(
        user.uid,
        topic.id,
        topics,
        store.getState().helm.notes.items,
      );
      leave();
      addToast({
        title: HELM_COPY.topicDeletedToast(topic.name),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void restore().then(
              (outcome) =>
                addToast({
                  title:
                    outcome === 'exists'
                      ? HELM_COPY.restoreExists
                      : outcome === 'partial'
                        ? HELM_COPY.topicRestorePartial(topic.name)
                        : outcome === 'skipped'
                          ? HELM_COPY.topicDeletedBackSkipped(topic.name)
                          : HELM_COPY.topicDeletedBack(topic.name),
                  type: outcome === 'partial' ? 'error' : 'info',
                }),
              (error: unknown) => {
                console.error('Helm deleted topic was not restored', error);
                addToast({ title: HELM_COPY.topicUndoFailed, type: 'error' });
              },
            ),
        },
      });
    } catch (error) {
      console.error('Helm topic was not deleted', error);
      addToast({
        title: isUnavailable(error)
          ? HELM_COPY.topicDeleteNeedsConnection
          : error instanceof TopicDeletePartialError
            ? HELM_COPY.topicDeletePartial(topic.name)
            : HELM_COPY.topicDeleteFailed,
        type: isUnavailable(error) ? 'info' : 'error',
      });
    }
  };

  const canMove =
    topic !== null &&
    (moveRefusal(topic.id, null, topics) === null ||
      legalParents(topic.id, topics).length > 0);
  const menu = topic
    ? {
        items: [
          option({ label: HELM_COPY.topicMenuRename, value: 'rename' }),
          ...(createRefusal(topic.id, topics) === null
            ? [option({ label: HELM_COPY.topicMenuAddSub, value: 'add' })]
            : []),
          ...(canMove
            ? [option({ label: HELM_COPY.topicMenuMove, value: 'move' })]
            : []),
          option({ label: HELM_COPY.topicMenuDelete, value: 'delete' }),
        ],
        onItemSelect: (value: string) => {
          if (value === 'rename') setIsRenaming(true);
          else if (value === 'add') setIsAddingSub(true);
          else if (value === 'move') setIsMoving(true);
          else if (value === 'delete') void remove();
        },
      }
    : undefined;

  return (
    <>
      <HelmHeader
        backLabel={parent ? parent.name : HELM_COPY.knowledgeTitle}
        onBack={leave}
        onHome={onHome}
        menu={menu}
      />
      <main className='space-y-4 pt-4'>
        {isLoaded && !topic && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.topicGone}
          </p>
        )}
        {topic && (
          <>
            <div className='space-y-1'>
              <div className='flex items-start justify-between gap-3'>
                <h1 className='helm-serif text-[28px] leading-[34px] break-words'>
                  {topic.emoji && (
                    <span aria-hidden='true'>{topic.emoji} </span>
                  )}
                  {topic.name}
                </h1>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className="relative mt-1 shrink-0 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
                  onClick={() => setIsMakingNote(true)}
                >
                  <Plus className='size-4' aria-hidden='true' />
                  {HELM_COPY.noteNew}
                </Button>
              </div>
              {topic.depth > 1 && (
                <p className='text-muted-foreground text-[13px] break-words'>
                  {pathOf(topic.id, topics).join(' › ')}
                </p>
              )}
              <p className='text-muted-foreground text-[13px]'>
                {HELM_COPY.topicCountLine(subtopicList.length, notes.length)}
              </p>
            </div>
            {subtopicList.length > 0 && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {subtopicList.map((sub) => (
                  <li key={sub.id}>
                    <TopicRow topic={sub} indent={0} onOpen={onOpenTopic} />
                  </li>
                ))}
              </ul>
            )}
            {notes.length === 0 ? (
              <p className='text-muted-foreground text-[15px]'>
                {HELM_COPY.topicNotesEmpty}
              </p>
            ) : (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {notes.map((note) => (
                  <li key={note.id}>
                    <NoteRow note={note} onOpen={setOpenNoteId} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
      <NoteSheet noteId={openNoteId} onClose={() => setOpenNoteId(null)} />
      {topic && (
        <>
          <NoteForm
            isOpen={isMakingNote}
            onClose={() => setIsMakingNote(false)}
            note={null}
            initialTopicIds={[topic.id]}
          />
          <TopicFormSheet
            isOpen={isRenaming}
            onClose={() => setIsRenaming(false)}
            topic={topic}
            parentId={topic.parentId}
          />
          <TopicFormSheet
            isOpen={isAddingSub}
            onClose={() => setIsAddingSub(false)}
            topic={null}
            parentId={topic.id}
          />
          <TopicMoveSheet
            isOpen={isMoving}
            onClose={() => setIsMoving(false)}
            topic={topic}
            onPick={(parentId) => void move(parentId)}
          />
        </>
      )}
    </>
  );
}

export default TopicScreen;
