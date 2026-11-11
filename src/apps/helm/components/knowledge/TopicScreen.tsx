import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight, Plus } from 'lucide-react';

import MarkdownText from '@/components/MarkdownText';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import NoteForm from '@apps/helm/components/knowledge/NoteForm';
import NoteRow from '@apps/helm/components/knowledge/NoteRow';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import SectionEditSheet from '@apps/helm/components/knowledge/SectionEditSheet';
import SectionSourcesSheet from '@apps/helm/components/knowledge/SectionSourcesSheet';
import TopicFormSheet from '@apps/helm/components/knowledge/TopicFormSheet';
import TopicMoveSheet from '@apps/helm/components/knowledge/TopicMoveSheet';
import TopicRow from '@apps/helm/components/knowledge/TopicRow';
import TopicVersionsSheet from '@apps/helm/components/knowledge/TopicVersionsSheet';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { CLAIM_MS, HELM_COPY } from '@apps/helm/constants';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { useTopicVersions } from '@apps/helm/hooks/useTopicVersions';
import {
  getTopicWriteState,
  subscribeTopicWrites,
  writeTopic,
} from '@apps/helm/queries/nomosMutations';
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

const HEADING_CLASS = {
  1: 'helm-serif text-[22px] leading-[28px]',
  2: 'helm-serif text-[18px] leading-[24px]',
  3: 'text-foreground text-[15px] leading-[21px] font-semibold',
} as const;

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
  const [sourcesId, setSourcesId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ sectionId: string | null } | null>(
    null,
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isReadingNew, setIsReadingNew] = useState(false);
  const askedFor = useRef<string | null>(null);
  const write = useSyncExternalStore(
    subscribeTopicWrites,
    () => getTopicWriteState(topicId ?? ''),
    () => null,
  );
  const parent = topic?.parentId
    ? (topics.find((entry) => entry.id === topic.parentId) ?? null)
    : null;
  const leave = () => (parent ? onOpenParent(parent.id) : onBack());
  const subtopicList = [...(subtopics ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );

  useScreenContext(
    'topic',
    null,
    [],
    {
      ask: topic ? HELM_COPY.askTopic : HELM_COPY.askKnowledge,
      chip: topic ? HELM_COPY.chipTopic(topic.name) : HELM_COPY.chipKnowledge,
      back: topic
        ? HELM_COPY.backToTopic(topic.name)
        : HELM_COPY.backToKnowledge,
    },
    'page',
    topic?.id ?? null,
  );

  const { versions: newestVersions } = useTopicVersions(topic?.id ?? null, 1);
  const newest = newestVersions?.[0] ?? null;
  const historyLine =
    topic && newest && newest.version === topic.version
      ? HELM_COPY.topicHistoryLine(
          formatDateShort(newest.createdAt),
          newest.changeSummary || HELM_COPY.historyReason(newest.reason),
        )
      : null;

  const now = useNow(15_000);
  const isStaleClaim =
    topic !== null &&
    topic.docState === 'writing' &&
    topic.writeClaim !== null &&
    now - topic.writeClaim.at >= CLAIM_MS;
  const isBehind =
    topic !== null &&
    (topic.docState === 'behind' ||
      isStaleClaim ||
      topic.docState === 'failed' ||
      (topic.docState === 'empty' && notes.length > 0));
  useEffect(() => {
    if (!topic || !isBehind || askedFor.current === topic.id) return;
    if (!navigator.onLine) return;
    askedFor.current = topic.id;
    void writeTopic(topic.id);
  }, [topic, isBehind]);

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

  const waitingIds = new Set(topic?.pendingNoteIds ?? []);
  const waitingNotes = notes.filter((note) => waitingIds.has(note.id));
  const waitingCount =
    topic === null
      ? 0
      : topic.version === 0
        ? notes.length
        : topic.pendingNoteIds.length;
  const statusOf = () => {
    if (!topic) return null;
    if (
      write?.kind === 'writing' ||
      (topic.docState === 'writing' && !isStaleClaim)
    ) {
      return { line: HELM_COPY.topicBringingIn(waitingCount), action: null };
    }
    if (write?.kind === 'limited') {
      return {
        line: HELM_COPY.topicLimitedLine(write.waiting),
        action: HELM_COPY.topicReadThemNow,
      };
    }
    if (write?.kind === 'soon') {
      return {
        line: HELM_COPY.topicSoonLine(waitingCount),
        action: HELM_COPY.topicTryAgain,
      };
    }
    if (
      (write?.kind === 'failed' && topic.docState !== 'current') ||
      topic.docState === 'failed'
    ) {
      return {
        line: HELM_COPY.topicFailedLine(waitingCount),
        action: HELM_COPY.topicTryAgain,
      };
    }
    if (isBehind && waitingCount > 0) {
      return {
        line: HELM_COPY.topicFailedLine(waitingCount),
        action: HELM_COPY.topicBringThemIn,
      };
    }
    return null;
  };
  const status = statusOf();
  const sourcesSection =
    topic?.sections.find((section) => section.id === sourcesId) ?? null;
  const editingSection =
    topic?.sections.find((section) => section.id === editing?.sectionId) ??
    null;

  const canMove =
    topic !== null &&
    (moveRefusal(topic.id, null, topics) === null ||
      legalParents(topic.id, topics).length > 0);
  const menu = topic
    ? {
        items: [
          option({ label: HELM_COPY.topicMenuRename, value: 'rename' }),
          ...(topic.version > 0
            ? [option({ label: HELM_COPY.topicMenuHistory, value: 'history' })]
            : []),
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
          else if (value === 'history') setIsHistoryOpen(true);
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
              {historyLine && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className="text-muted-foreground relative block h-auto max-w-full min-w-0 px-0! py-0! text-left text-[13px] font-normal before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
                  onClick={() => setIsHistoryOpen(true)}
                >
                  <span className='block truncate'>{historyLine}</span>
                </Button>
              )}
            </div>
            {status && (
              <div className='helm-card flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5'>
                <p className='text-muted-foreground min-w-0 text-[13px] text-pretty'>
                  {status.line}
                </p>
                {status.action && (
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    className="relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
                    onClick={() =>
                      write?.kind === 'limited'
                        ? setIsReadingNew(true)
                        : void writeTopic(topic.id)
                    }
                  >
                    {status.action}
                  </Button>
                )}
              </div>
            )}
            {isReadingNew && waitingNotes.length > 0 && (
              <section className='space-y-2'>
                <SectionDivider label={HELM_COPY.topicNewNotesHeading} />
                <ul className='helm-card divide-border divide-y overflow-hidden'>
                  {waitingNotes.map((note) => (
                    <li key={note.id}>
                      <NoteRow note={note} onOpen={setOpenNoteId} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {subtopicList.length > 0 && topic.overview && (
              <MarkdownText text={topic.overview} />
            )}
            {subtopicList.length > 0 && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {subtopicList.map((sub) => (
                  <li key={sub.id}>
                    <TopicRow topic={sub} indent={0} onOpen={onOpenTopic} />
                  </li>
                ))}
              </ul>
            )}
            {topic.sections.map((section) => (
              <section
                key={section.id}
                className='space-y-2'
                onClick={(event) => {
                  if (!(event.target as HTMLElement).closest('a'))
                    setSourcesId(section.id);
                }}
              >
                {section.heading &&
                  (section.level === 3 ? (
                    <h3 className={HEADING_CLASS[3]}>{section.heading}</h3>
                  ) : (
                    <h2 className={HEADING_CLASS[section.level]}>
                      {section.heading}
                    </h2>
                  ))}
                <MarkdownText text={section.markdown} />
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  aria-label={HELM_COPY.topicSectionOpen(section.heading)}
                  className="text-muted-foreground relative -ml-2 after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSourcesId(section.id);
                  }}
                >
                  {HELM_COPY.sourcesTitle}
                  <ChevronRight className='size-3.5' aria-hidden='true' />
                </Button>
              </section>
            ))}
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
              onClick={() => setEditing({ sectionId: null })}
            >
              <Plus className='size-4' aria-hidden='true' />
              {HELM_COPY.topicAddPart}
            </Button>
            {notes.length === 0 ? (
              topic.sections.length === 0 && (
                <p className='text-muted-foreground text-[15px]'>
                  {HELM_COPY.topicNotesEmpty}
                </p>
              )
            ) : (
              <section className='space-y-2'>
                {topic.sections.length > 0 && (
                  <SectionDivider label={HELM_COPY.topicNotesDivider} />
                )}
                <ul className='helm-card divide-border divide-y overflow-hidden'>
                  {notes.map((note) => (
                    <li key={note.id}>
                      <NoteRow note={note} onOpen={setOpenNoteId} />
                    </li>
                  ))}
                </ul>
              </section>
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
          <SectionSourcesSheet
            section={sourcesSection}
            onClose={() => setSourcesId(null)}
            onEdit={(sectionId) => {
              setSourcesId(null);
              setEditing({ sectionId });
            }}
          />
          <SectionEditSheet
            isOpen={
              editing !== null &&
              (editing.sectionId === null || editingSection !== null)
            }
            onClose={() => setEditing(null)}
            topicId={topic.id}
            version={topic.version}
            section={editingSection}
          />
          <TopicVersionsSheet
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            topic={topic}
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
