import type { OpenCapture } from '@apps/helm/types';

/** When the person last sent a turn of their own, over the leads of the turns shown: an answer to a card and a message that joined another turn are not a new turn, so tapping one choice never settles its sibling. Null when there is none. */
export const readNewestTurnAt = (leads: readonly OpenCapture[]) =>
  leads
    .filter((turn) => turn.answersQuestion === null)
    .reduce<number | null>(
      (newest, turn) =>
        newest === null || turn.createdAt > newest ? turn.createdAt : newest,
      null,
    );

/** Whether the person has sent a turn since this moment, so what was offered then can no longer be acted on. A surface that doesn't settle passes null. */
export const isPastTurn = (at: number, newestTurnAt: number | null) =>
  newestTurnAt !== null && newestTurnAt > at;

export type QuestionPlace = 'live' | 'settled' | 'below';

/** Where an open question stands on the turn that raised it: live while no later turn exists, settled once the person moved past it, and `below` while a re-ask of it is the live one at the bottom of the thread. */
export function readQuestionPlace(input: {
  turnAt: number;
  reaskedAt: number | null;
  newestTurnAt: number | null;
}): QuestionPlace {
  const { turnAt, reaskedAt, newestTurnAt } = input;
  const isPast = isPastTurn(Math.max(turnAt, reaskedAt ?? 0), newestTurnAt);
  if (isPast) return 'settled';
  return reaskedAt === null ? 'live' : 'below';
}
