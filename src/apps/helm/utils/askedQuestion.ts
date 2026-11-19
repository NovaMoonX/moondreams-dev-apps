import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { isAnswerInFlight } from '@apps/helm/store/actions/questionActions';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenCapture } from '@apps/helm/types';
import { getOpenQuestions } from '@apps/helm/utils/heldCaptures';
import { createSettledReader } from '@apps/helm/utils/linearThread';
import {
  pickQuestionTurn,
  type AnswerRoute,
} from '@apps/helm/utils/openQuestion';
import { pickComposerTarget } from '@apps/helm/utils/questionAnswers';
import { getFreshFrom, getOpenSessionId } from '@apps/helm/utils/sessions';

function findAsked(
  all: OpenCapture[],
  freshFrom: number,
  route: AnswerRoute,
  now: number,
  kind: string | null,
) {
  const sessionId = getOpenSessionId(all, now, freshFrom);
  const session = all.filter((capture) => capture.sessionId === sessionId);
  const isSettled = createSettledReader(all);
  const openOf = (turn: OpenCapture) =>
    turn.status !== 'needsYou'
      ? []
      : getOpenQuestions(turn)
          .filter(
            (entry) =>
              entry.skippedAt === null &&
              !isSettled(turn, entry.id) &&
              !isAnswerInFlight(turn.id, entry.id),
          )
          .map((entry) => ({ captureId: turn.id, ...entry }));
  if (route === 'typed' && kind === null) {
    // The newest turn still asking anything, so a card of choices there keeps typed words from reaching an older turn's question.
    const latest = session
      .filter((turn) => turn.answersQuestion === null)
      .reverse()
      .find((turn) => openOf(turn).length > 0);
    const asked = latest && pickComposerTarget(openOf(latest));
    return latest && asked ? { latest, asked } : null;
  }
  const latest = pickQuestionTurn(session, route, now);
  if (!latest) return null;
  const asked = openOf(latest).find(
    (entry) => kind === null || entry.question.kind === kind,
  );
  return asked ? { latest, asked } : null;
}

/** The first open, unskipped question (of a kind, when given) of the turn an answer goes to, with that turn. A typed answer goes to the first question that takes typed words in the newest turn still asking anything. */
export function readAskedQuestion(
  state: RootState,
  route: AnswerRoute,
  now: number,
  kind: string | null = null,
) {
  return findAsked(
    selectAllCaptures(state),
    getFreshFrom(state.helm.profile),
    route,
    now,
    kind,
  );
}

/** The question the composer answers, as `captureId:questionId`, worked out once for every card; `now` is a coarse clock, so it is recomputed only as that ticks or the turns change. */
export const selectComposerTargetKey = createSelector(
  [
    selectAllCaptures,
    (state: RootState) => getFreshFrom(state.helm.profile),
    (_state: RootState, now: number) => now,
  ],
  (all, freshFrom, now) => {
    const found = findAsked(all, freshFrom, 'typed', now, null);
    return found ? `${found.asked.captureId}:${found.asked.id}` : null;
  },
);
