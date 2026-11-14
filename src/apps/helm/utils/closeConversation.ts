import {
  readClosingPhrase,
  type ClosingRead,
} from '@/lib/speech/closingPhrase';
import { toPlainText } from '@/lib/speech/speechText';
import type { QuestionRef } from '@apps/helm/store/actions/captureActions';
import type { HelmQuestion, OpenCapture } from '@apps/helm/types';
import {
  matchSpokenAnswer,
  type SpokenAnswer,
} from '@apps/helm/utils/questionAnswers';
import { isUndoPhrase } from '@apps/helm/utils/voicePhrases';

export interface CloseEffects {
  /** Words that were typed or heard and not yet sent; a close drops them, and Undo puts them back in the field. */
  dropWords: string[];
  /** Open questions about requests not yet done, and confirms waiting for a yes: they stand no longer. */
  left: QuestionRef[];
  /** Open questions about something already filed: they wait in Needs you like a skipped one. */
  skipped: QuestionRef[];
  /** Whether anything was dropped, which is when the line offers Undo. */
  hasDropped: boolean;
}

const isOpen = (capture: OpenCapture, id: string) => {
  const state = capture.questionState[id];
  return (
    state.answeredAt === null &&
    (state.skippedAt ?? null) === null &&
    (state.leftAt ?? null) === null
  );
};

/** What a close drops and what it keeps for the open session. Everything already done (executions and their Undo) is never listed: only questions are changed. `isFiled` says whether a turn already made something. */
export function readCloseEffects(session: {
  unsentWords: string[];
  captures: OpenCapture[];
  isFiled: (capture: OpenCapture) => boolean;
}): CloseEffects {
  const open = session.captures.flatMap((capture) =>
    Object.keys(capture.questionState)
      .filter((id) => isOpen(capture, id))
      .map((id) => ({
        ref: { captureId: capture.id, questionId: id },
        isFiled: session.isFiled(capture),
      })),
  );
  const left = open.filter((entry) => !entry.isFiled).map((entry) => entry.ref);
  const dropWords = session.unsentWords.filter((words) => words.trim() !== '');
  return {
    dropWords,
    left,
    skipped: open.filter((entry) => entry.isFiled).map((entry) => entry.ref),
    hasDropped: dropWords.length > 0 || left.length > 0,
  };
}

export type DeviceTurn =
  | { kind: 'undo' }
  /** The words answer the open question. */
  | { kind: 'answer'; answer: SpokenAnswer }
  /** "stop" over a line with something still waiting: the voice stops and listening goes on for the answer. */
  | { kind: 'stopVoice' }
  | { kind: 'close'; close: ClosingRead }
  /** Nothing on the device took the words; they go on (`text` is without a finish phrase) and `isFinish` says listening doesn't reopen after the reply. */
  | { kind: 'send'; text: string; isFinish: boolean };

const closeOf = (close: ClosingRead | null): DeviceTurn =>
  close === null
    ? { kind: 'close', close: { kind: 'dismiss', position: 'whole', rest: '' } }
    : { kind: 'close', close };

const STOP = /^(?:(?:oh|um|uh|okay|ok|well|just|hey)\s+)*stop$/;
const CANCEL_IT = /(?:^|\s)cancel (?:it|that)$/;

/**
 * Where a final transcript or sent text goes on the device, in order: "Undo that" (spoken only), the open question's own
 * answer, "stop" over a line being said (spoken only), a closing phrase, then the server. Nothing here calls a model.
 * A typed text is an answer only when it is a closing phrase that also answers ("nothing", "no thanks").
 */
export function readDeviceTurn(input: {
  text: string;
  isSpoken: boolean;
  isTalkedOver: boolean;
  question: HelmQuestion | null;
  isPending: boolean;
  hasPage: boolean;
  extra: readonly string[];
  now: number;
  timeZone: string;
}): DeviceTurn {
  const { text, isSpoken, question, extra } = input;
  const close = readClosingPhrase(text, { extra });
  if (isSpoken && isUndoPhrase(text)) return { kind: 'undo' };
  const answer = question
    ? matchSpokenAnswer(text, question, {
        now: input.now,
        timeZone: input.timeZone,
      })
    : null;
  const isFreeText = question?.shape === 'freeText';
  if (
    answer &&
    !(isFreeText && close !== null) &&
    (isSpoken || close !== null)
  ) {
    return { kind: 'answer', answer };
  }
  if (isSpoken && input.isTalkedOver && STOP.test(toPlainText(text))) {
    return input.isPending ? { kind: 'stopVoice' } : closeOf(close);
  }
  if (close === null) return { kind: 'send', text, isFinish: false };
  if (close.kind === 'finish' && close.position === 'end') {
    return { kind: 'send', text: close.rest, isFinish: true };
  }
  const isCancelIt =
    close.kind === 'dismiss' &&
    close.position === 'whole' &&
    CANCEL_IT.test(toPlainText(text));
  return isCancelIt && !input.isPending && input.hasPage
    ? { kind: 'send', text, isFinish: false }
    : { kind: 'close', close };
}
