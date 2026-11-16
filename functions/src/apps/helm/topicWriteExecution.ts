import type { SealedPayload } from '../../appKeys/seal.js';
import { AUTOMATIC_LEVEL } from './nomos/policy.js';

/** A write past the first version records the version it made, so Undo restores the one before as a new version; the first write has nothing to go back to and records no effect. */
export const buildWriteExecution = (
  now: number,
  seal: (fields: Record<string, unknown>) => SealedPayload,
  summary: string,
  written: {
    topicId: string;
    name: string;
    reason: string;
    from: number;
    to: number;
  },
) => {
  const isUndoable = written.from >= 1;
  return {
    captureId: null,
    actor: 'nomos',
    category: 'organize',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: isUndoable
      ? [{ op: 'update', collection: 'topics', docId: written.topicId }]
      : [],
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    undoneDocIds: null,
    partUndoIds: null,
    questionRef: null,
    errorCode: null,
    createdAt: now,
    decidedAt: now,
    finishedAt: now,
    sealed: seal({
      summary,
      commands: [],
      effects: isUndoable
        ? [
            {
              written: {
                version: written.to,
                change: written.reason,
                'sealed.title': written.name,
              },
              previous: {
                version: written.from,
                'sealed.title': written.name,
              },
            },
          ]
        : [],
      undoReport: null,
      spoken: null,
      goneIds: null,
      said: null,
      lines: null,
    }),
  };
};
