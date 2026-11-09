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
}

/** One row per change; after an Undo the taken-back rows are struck and the ones the person changed since say so. */
function ResultRows({ execution, lines, undo }: ResultRowsProps) {
  const takenBack = getTakenBackIds(undo);
  const isUndone = execution.undoneByExecutionId !== null && undo !== null;

  return (
    <ul aria-label={HELM_COPY.resultLabel} className='divide-border divide-y'>
      {lines.map((line, index) => {
        const isStruck =
          isUndone && takenBack.has(execution.effectRefs[index]?.docId ?? '');
        const isKept = isUndone && !isStruck;
        return (
          <li key={line.key} className='px-3.5 py-2.5'>
            <p
              className={join(
                'text-[15px] leading-[21px] break-words',
                isStruck && 'text-muted-foreground line-through',
              )}
            >
              {line.title}
            </p>
            {(isKept || line.detail) && (
              <p className='text-muted-foreground text-[13px] break-words'>
                {isKept ? HELM_COPY.keptRow : line.detail}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default ResultRows;
