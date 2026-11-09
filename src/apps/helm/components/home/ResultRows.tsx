import { join } from '@moondreamsdev/dreamer-ui/utils';

import { HELM_COPY } from '@apps/helm/constants';
import { getTakenBackIds } from '@apps/helm/nomos/planUndo';
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

/** One row per change; after an Undo the taken-back rows are struck, and the ones kept or deleted since say so. */
function ResultRows({ execution, lines, undo, isFlat }: ResultRowsProps) {
  const takenBack = getTakenBackIds(undo);
  const gone = new Set(undo?.goneIds ?? []);
  const isUndone = execution.undoneByExecutionId !== null && undo !== null;

  return (
    <ul aria-label={HELM_COPY.resultLabel} className='divide-border divide-y'>
      {lines.map((line, index) => {
        const docId = execution.effectRefs[index]?.docId ?? '';
        const isStruck = isUndone && takenBack.has(docId);
        const isGone = isUndone && !isStruck && gone.has(docId);
        const isKept = isUndone && !isStruck && !isGone;
        const note = isGone
          ? HELM_COPY.deletedRow
          : isKept
            ? HELM_COPY.keptRow
            : line.detail;
        return (
          <li key={line.key} className={isFlat ? 'py-2.5' : 'px-3.5 py-2.5'}>
            <p
              className={join(
                'text-[15px] leading-[21px] break-words',
                isStruck && 'text-muted-foreground line-through',
              )}
            >
              {line.title}
            </p>
            {note && (
              <p className='text-muted-foreground text-[13px] break-words'>
                {note}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default ResultRows;
