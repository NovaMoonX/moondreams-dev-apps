import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { getTakenBackIds } from '@apps/helm/nomos/planUndo';
import {
  selectNoteById,
  selectTopicById,
} from '@apps/helm/store/selectors/knowledgeSelectors';
import type { OpenExecution } from '@apps/helm/types';
import type { ResultLine } from '@apps/helm/utils/resultLines';

interface ResultRowsProps {
  execution: OpenExecution;
  lines: ResultLine[];
  /** The Undo that took this execution back, once it is known: its rows strike through, the rest say they were kept. */
  undo: OpenExecution | null;
  /** No inset: the list sits on a sheet, not in a card. */
  isFlat?: boolean;
}

/** One row per change; after an Undo the taken-back rows are struck, and the ones kept or deleted since say so. A row for a note opens it over this screen, and a row for a topic opens that topic from home. */
function ResultRows({ execution, lines, undo, isFlat }: ResultRowsProps) {
  const takenBack = getTakenBackIds(undo);
  const gone = new Set(undo?.goneIds ?? []);
  const isUndone = execution.undoneByExecutionId !== null && undo !== null;
  const noteById = useAppSelector(selectNoteById);
  const topicById = useAppSelector(selectTopicById);
  const { showView } = useHelmUrlState();
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  return (
    <>
      <ul aria-label={HELM_COPY.resultLabel} className='divide-border divide-y'>
        {lines.map((line) => {
          const { docId } = line;
          const isTracked = isUndone && !line.isNoEffect;
          const isStruck = isTracked && takenBack.has(docId);
          const isGone = isTracked && !isStruck && gone.has(docId);
          const isKept = isTracked && !isStruck && !isGone;
          const refNote =
            line.ref?.collection === 'notes'
              ? noteById.get(line.ref.id)
              : undefined;
          const topicId =
            !isFlat &&
            line.ref?.collection === 'topics' &&
            topicById.has(line.ref.id)
              ? line.ref.id
              : null;
          const looseDetail =
            refNote && refNote.topicIds.length === 0
              ? HELM_COPY.noteLoose
              : null;
          const note = isGone
            ? HELM_COPY.deletedRow
            : isKept
              ? HELM_COPY.keptRow
              : (line.detail ?? looseDetail);
          const noteId = refNote && line.ref ? line.ref.id : null;
          const open = noteId
            ? () => setOpenNoteId(noteId)
            : topicId
              ? () =>
                  afterBackLayersClose(() => void showView('topic', topicId))
              : null;
          const titleLine = (
            <p
              className={join(
                'text-[15px] leading-[21px] break-words',
                isStruck && 'text-muted-foreground line-through',
              )}
            >
              {line.title}
            </p>
          );
          const detailLine = note && (
            <p className='text-muted-foreground text-[13px] break-words'>
              {note}
            </p>
          );
          return (
            <li
              key={line.key}
              className={open ? undefined : isFlat ? 'py-2.5' : 'px-3.5 py-2.5'}
            >
              {open ? (
                <Button
                  type='button'
                  variant='tertiary'
                  className={join(
                    'h-auto w-full min-w-0 rounded-none border-0 text-left font-normal focus-visible:-outline-offset-2',
                    isFlat ? 'px-0 py-2.5' : 'px-3.5 py-2.5',
                  )}
                  onClick={open}
                >
                  <span className='flex w-full items-center gap-2'>
                    <span className='min-w-0 flex-1'>
                      {titleLine}
                      {detailLine}
                    </span>
                    <ChevronRight
                      className='text-muted-foreground size-4 shrink-0'
                      aria-hidden
                    />
                  </span>
                </Button>
              ) : (
                <>
                  {titleLine}
                  {detailLine}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <NoteSheet noteId={openNoteId} onClose={() => setOpenNoteId(null)} />
    </>
  );
}

export default ResultRows;
