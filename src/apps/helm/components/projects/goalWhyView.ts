import { HELM_COPY } from '@apps/helm/constants';
import { whyFingerprint, type GoalWhy } from '@apps/helm/utils/goalWhy';

/** "Sun, Nov 8": the day the words were said, in the viewer's zone. */
const formatSaidDay = (at: number) =>
  new Date(at).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

/** The tidied text to offer: only while it is still offered, still made from these words, and different from them. */
export const readTidyOffer = (why: GoalWhy | null) =>
  why !== null &&
  why.cleanedState === 'offered' &&
  why.cleaned !== null &&
  why.basedOn === whyFingerprint(why.verbatim) &&
  why.cleaned.trim() !== why.verbatim.trim()
    ? why.cleaned
    : null;

/** Where the shown why came from: a captured turn is said, anything else was typed. */
export const readWhySource = (why: GoalWhy, isTidied: boolean) => {
  const isSaid = why.captureId !== null;
  const day = formatSaidDay(why.saidAt);
  if (isTidied) {
    return isSaid
      ? HELM_COPY.goalWhyTidiedSaid(day)
      : HELM_COPY.goalWhyTidiedWrote(day);
  }
  return isSaid ? HELM_COPY.goalWhySaid(day) : HELM_COPY.goalWhyWrote(day);
};
