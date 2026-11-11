import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { markNoteChecked } from '@apps/helm/store/actions/noteActions';
import { selectNoteById } from '@apps/helm/store/selectors/knowledgeSelectors';
import type { TopicSection, TopicSource } from '@apps/helm/types';

interface SectionSourcesSheetProps {
  /** The part to show, read live by the host; null keeps the sheet closed. */
  section: TopicSection | null;
  onClose: () => void;
  onEdit: (sectionId: string) => void;
}

const ROW =
  'flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2';

/** Where one part of a topic's document came from: a row per source, a note opening in place of this sheet, and Edit this part. */
function SectionSourcesSheet({
  section,
  onClose,
  onEdit,
}: SectionSourcesSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const noteById = useAppSelector(selectNoteById);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const rowOf = (
    source: TopicSource,
  ): {
    text: string;
    noteId: string | null;
    unCheckedNoteId: string | null;
  } => {
    const noteTitle = (noteId: string | null) => {
      const note = noteId === null ? undefined : noteById.get(noteId);
      return note ? note.title || HELM_COPY.noteUntitled : null;
    };
    if (source.kind === 'note') {
      const title = noteTitle(source.noteId);
      return title === null
        ? {
            text: HELM_COPY.sourceNoteGone,
            noteId: null,
            unCheckedNoteId: null,
          }
        : {
            text: HELM_COPY.sourceNote(title),
            noteId: source.noteId,
            unCheckedNoteId: null,
          };
    }
    if (source.kind === 'message') {
      return {
        text: HELM_COPY.sourceMessage(formatDateShort(source.at)),
        noteId: null,
        unCheckedNoteId: null,
      };
    }
    if (source.kind === 'general') {
      const note =
        source.noteId === null ? undefined : noteById.get(source.noteId);
      const isUnchecked = note !== undefined && note.checkedAt === null;
      return {
        text: isUnchecked
          ? HELM_COPY.sourceGeneralNotChecked
          : HELM_COPY.sourceGeneral,
        noteId: note ? source.noteId : null,
        unCheckedNoteId: isUnchecked ? source.noteId : null,
      };
    }
    if (source.kind === 'file') {
      return {
        text: HELM_COPY.sourceFile,
        noteId: noteTitle(source.noteId) === null ? null : source.noteId,
        unCheckedNoteId: null,
      };
    }
    return {
      text: HELM_COPY.sourcePerson(formatDateShort(source.at)),
      noteId: null,
      unCheckedNoteId: null,
    };
  };

  const rows = (section?.sources ?? []).map(rowOf);
  const close = () => {
    setOpenNoteId(null);
    onClose();
  };

  const check = async (noteId: string) => {
    if (!user) return;
    try {
      await markNoteChecked(user.uid, noteId);
    } catch (error) {
      console.error('Helm note was not marked checked', error);
      addToast({ title: HELM_COPY.noteCheckFailed, type: 'error' });
    }
  };

  const rowText = (text: string) => (
    <span className='text-foreground min-w-0 flex-1 text-[15px] leading-[21px] break-words'>
      {text}
    </span>
  );

  return (
    <>
      <DetailSheet
        isOpen={section !== null && openNoteId === null}
        onClose={close}
        title={section?.heading || HELM_COPY.sourcesTitle}
        footer={
          section && (
            <div className='px-6 pt-2 pb-3'>
              <ModalFooterActions
                rightActions={
                  <Button
                    type='button'
                    variant='secondary'
                    onClick={() => onEdit(section.id)}
                  >
                    {HELM_COPY.sourcesEditPart}
                  </Button>
                }
              />
            </div>
          )
        }
      >
        {rows.length === 0 ? (
          <p className='text-muted-foreground text-[15px]'>
            {HELM_COPY.sourcesEmpty}
          </p>
        ) : (
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {rows.map((row, index) => (
              <li key={`${index}-${row.text}`}>
                {row.noteId === null ? (
                  <div className={ROW}>{rowText(row.text)}</div>
                ) : (
                  <Button
                    type='button'
                    variant='tertiary'
                    className={ROW}
                    onClick={() => setOpenNoteId(row.noteId)}
                  >
                    {rowText(row.text)}
                    <ChevronRight
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                )}
                {row.unCheckedNoteId !== null && (
                  <div className='px-4 pb-3'>
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      className='relative after:absolute after:-inset-x-1 after:-inset-y-1.5 after:content-[""]'
                      onClick={() => void check(row.unCheckedNoteId ?? '')}
                    >
                      {HELM_COPY.noteIChecked}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DetailSheet>
      <NoteSheet noteId={openNoteId} onClose={() => setOpenNoteId(null)} />
    </>
  );
}

export default SectionSourcesSheet;
