import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { BookOpen, ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import NoteTopicsSheet from '@apps/helm/components/knowledge/NoteTopicsSheet';
import SavedNoteTopicQuestion from '@apps/helm/components/home/SavedNoteTopicQuestion';
import { HELM_COPY } from '@apps/helm/constants';
import { selectAllTopics } from '@apps/helm/store/selectors/knowledgeSelectors';
import type { OpenNote } from '@apps/helm/types';
import { pathOf } from '@apps/helm/utils/topicTree';

interface SavedNoteLineProps {
  note: OpenNote;
  /** True while the note is loose and the topic question is still open. */
  isAsking: boolean;
  onAnswered: () => void;
  onUndo: () => void;
  isUndoing: boolean;
  /** True until the save's batch has committed, so Undo waits for it. */
  isSaving: boolean;
}

/** The line a saved answer leaves where Save to my knowledge was: where it went, with Change topic and Undo (while the note is untouched), or the question of which topic when none fit. */
function SavedNoteLine({
  note,
  isAsking,
  onAnswered,
  onUndo,
  isUndoing,
  isSaving,
}: SavedNoteLineProps) {
  const topics = useAppSelector(selectAllTopics);
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const topic = topics.find((entry) => note.topicIds.includes(entry.id));
  const title = note.title || HELM_COPY.noteUntitled;
  const words = topic
    ? HELM_COPY.savedNoteIn(
        `${topic.emoji ? `${topic.emoji} ` : ''}${pathOf(topic.id, topics).join(' › ')}`,
      )
    : HELM_COPY.savedNoteLoose;

  return (
    <div className='flex flex-col gap-2.5'>
      <Button
        type='button'
        variant='tertiary'
        className='h-auto min-h-10 w-full min-w-0 justify-start gap-2 rounded-none border-0 px-0! py-1! text-left'
        aria-label={HELM_COPY.savedNoteOpen(title)}
        onClick={() => setIsOpen(true)}
      >
        <BookOpen
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
        <span className='min-w-0 flex-1 text-[15px] break-words'>{words}</span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <div className='flex items-center gap-2'>
        {note.lastEditedAt === null && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className="relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
            loading={isUndoing || isSaving}
            onClick={onUndo}
          >
            {HELM_COPY.undo}
          </Button>
        )}
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className="relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-['']"
          onClick={() => setIsChanging(true)}
        >
          {HELM_COPY.savedChangeTopic}
        </Button>
      </div>
      {isAsking && !topic && (
        <SavedNoteTopicQuestion
          note={note}
          onDone={onAnswered}
          onMore={() => setIsChanging(true)}
        />
      )}
      <NoteSheet
        noteId={isOpen ? note.id : null}
        onClose={() => setIsOpen(false)}
      />
      <NoteTopicsSheet
        isOpen={isChanging}
        onClose={() => setIsChanging(false)}
        note={note}
      />
    </div>
  );
}

export default SavedNoteLine;
