import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, Plus } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import NoteForm from '@apps/helm/components/knowledge/NoteForm';
import NoteRow from '@apps/helm/components/knowledge/NoteRow';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import TopicFormSheet from '@apps/helm/components/knowledge/TopicFormSheet';
import TopicRow from '@apps/helm/components/knowledge/TopicRow';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY, KNOWLEDGE_SEARCH_FROM } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import {
  selectAllNotes,
  selectAllTopics,
  selectLooseNotes,
  selectTopicTree,
} from '@apps/helm/store/selectors/knowledgeSelectors';
import type { OpenTopic } from '@apps/helm/types';
import { pathOf, type TopicNode } from '@apps/helm/utils/topicTree';

interface KnowledgeViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenTopic: (topicId: string) => void;
}

const flatten = (
  nodes: TopicNode<OpenTopic>[],
  level: 0 | 1 | 2 = 0,
): { topic: OpenTopic; level: 0 | 1 | 2 }[] =>
  nodes.flatMap((node) => [
    { topic: node.topic, level },
    ...flatten(node.children, Math.min(level + 1, 2) as 0 | 1 | 2),
  ]);

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Knowledge: the topic tree, A to Z, a door to the notes in no topic, and every note searchable once there are a few. */
function KnowledgeView({ onBack, onHome, onOpenTopic }: KnowledgeViewProps) {
  const assistant = useAssistantName();
  const notesSet = useAppSelector((state) => state.helm.notes);
  const topicsSet = useAppSelector((state) => state.helm.topics);
  const notes = useAppSelector(selectAllNotes);
  const allTopics = useAppSelector(selectAllTopics);
  const loose = useAppSelector(selectLooseNotes);
  const tree = useAppSelector(selectTopicTree);
  const [query, setQuery] = useState('');
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [isMakingNote, setIsMakingNote] = useState(false);
  const [isMakingTopic, setIsMakingTopic] = useState(false);
  const [isLooseOpen, setIsLooseOpen] = useState(false);

  useScreenContext('knowledge', null, [], {
    ask: HELM_COPY.askKnowledge,
    chip: HELM_COPY.chipKnowledge,
    back: HELM_COPY.backToKnowledge,
  });

  const isLoaded = notesSet.isLoaded && topicsSet.isLoaded;
  const isFailed = (notesSet.isFailed || topicsSet.isFailed) && !isLoaded;
  const rows = flatten(tree);
  const isEmpty = isLoaded && rows.length === 0 && notes.length === 0;
  const isSearching =
    notes.length >= KNOWLEDGE_SEARCH_FROM && query.trim() !== '';
  const searchable = useMemo(() => {
    const names = new Map(allTopics.map((topic) => [topic.id, topic.name]));
    return notes.map((note) => ({
      note,
      text: fold(
        [
          note.title,
          note.body,
          ...note.topicIds.map((id) => names.get(id) ?? ''),
        ].join(' '),
      ),
    }));
  }, [notes, allTopics]);
  const words = fold(query).split(/\s+/).filter(Boolean);
  const found = isSearching
    ? searchable
        .filter(({ text }) => words.every((word) => text.includes(word)))
        .map(({ note }) => note)
    : [];

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <div className='flex items-center justify-between gap-3'>
          <h1 className='helm-serif text-[28px] leading-[34px]'>
            {HELM_COPY.knowledgeTitle}
          </h1>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className="relative shrink-0 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
            onClick={() => setIsMakingNote(true)}
          >
            <Plus className='size-4' aria-hidden='true' />
            {HELM_COPY.noteNew}
          </Button>
        </div>
        {notes.length >= KNOWLEDGE_SEARCH_FROM && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={HELM_COPY.knowledgeSearch}
          />
        )}
        {isFailed && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.knowledgeFailed}
          </p>
        )}
        {isSearching ? (
          found.length === 0 ? (
            <p className='text-muted-foreground text-[15px]'>
              {HELM_COPY.knowledgeNoMatch}
            </p>
          ) : (
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {found.map((note) => (
                <li key={note.id}>
                  <NoteRow
                    note={note}
                    onOpen={setOpenNoteId}
                    topicLine={note.topicIds
                      .map((id) => pathOf(id, allTopics).join(' › '))
                      .filter(Boolean)
                      .join(', ')}
                  />
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            {isEmpty && (
              <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
                {HELM_COPY.knowledgeEmpty(assistant)}
              </p>
            )}
            {rows.length > 0 && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {rows.map(({ topic, level }) => (
                  <li key={topic.id}>
                    <TopicRow
                      topic={topic}
                      indent={level}
                      onOpen={onOpenTopic}
                    />
                  </li>
                ))}
              </ul>
            )}
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setIsMakingTopic(true)}
            >
              <Plus className='size-4' aria-hidden='true' />
              {HELM_COPY.topicNew}
            </Button>
            {isLoaded && loose.length > 0 && (
              <Button
                type='button'
                variant='secondary'
                className='flex h-auto w-full items-center justify-between gap-3 px-4 py-3 text-left'
                onClick={() => setIsLooseOpen(true)}
              >
                <span>{HELM_COPY.looseNotesRow(loose.length)}</span>
                <ChevronRight
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            )}
          </>
        )}
      </main>
      {isLooseOpen && (
        <Subview
          overlay
          title={HELM_COPY.looseNotesTitle}
          onClose={() => setIsLooseOpen(false)}
          headerAction={
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative shrink-0 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
              onClick={() => setIsMakingNote(true)}
            >
              <Plus className='size-4' aria-hidden='true' />
              {HELM_COPY.noteNew}
            </Button>
          }
        >
          {loose.length === 0 ? (
            <p className='text-muted-foreground text-[15px]'>
              {HELM_COPY.looseNotesEmpty}
            </p>
          ) : (
            <ul className='divide-border divide-y'>
              {loose.map((note) => (
                <li key={note.id}>
                  <NoteRow note={note} onOpen={setOpenNoteId} />
                </li>
              ))}
            </ul>
          )}
        </Subview>
      )}
      <NoteSheet noteId={openNoteId} onClose={() => setOpenNoteId(null)} />
      <NoteForm
        isOpen={isMakingNote}
        onClose={() => setIsMakingNote(false)}
        note={null}
      />
      <TopicFormSheet
        isOpen={isMakingTopic}
        onClose={() => setIsMakingTopic(false)}
        topic={null}
        parentId={null}
      />
    </>
  );
}

export default KnowledgeView;
