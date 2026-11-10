import { formatDateShort } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenFact } from '@apps/helm/types';

const DAY_MS = 86_400_000;

/** "today", "yesterday" or a short date, in the device's day. */
export const toFactDay = (at: number, now: number) => {
  const startOf = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((startOf(now) - startOf(at)) / DAY_MS);
  if (days === 0) return HELM_COPY.factToday;
  if (days === 1) return HELM_COPY.factYesterday;
  return formatDateShort(at);
};

/** The muted line under a fact: who stands behind it and when. */
export function getFactLine(fact: OpenFact, assistant: string, now: number) {
  if (fact.status === 'inferred') {
    return HELM_COPY.factLineInferred(
      assistant,
      toFactDay(fact.createdAt, now),
    );
  }
  const when = fact.confirmedAt ?? fact.createdAt;
  if (fact.stated === 'personCorrected') {
    return HELM_COPY.factLineCorrected(toFactDay(when, now));
  }
  if (fact.stated === 'nomosInferred') {
    return HELM_COPY.factLineConfirmed(toFactDay(when, now));
  }
  return HELM_COPY.factLineSaid(toFactDay(fact.createdAt, now));
}

/** The sheet's source line, which also says where the words came from. */
export function getFactSource(fact: OpenFact, assistant: string, now: number) {
  const day = toFactDay(fact.createdAt, now);
  if (fact.stated === 'personCorrected') {
    return HELM_COPY.factSourceCorrected(
      toFactDay(fact.confirmedAt ?? fact.createdAt, now),
    );
  }
  if (fact.stated === 'personSaid') {
    return fact.sourceCaptureId
      ? HELM_COPY.factSourceSaid(assistant, day)
      : HELM_COPY.factSourceAdded(day);
  }
  if (fact.status === 'confirmed') {
    return HELM_COPY.factSourceConfirmed(
      assistant,
      day,
      toFactDay(fact.confirmedAt ?? fact.createdAt, now),
    );
  }
  return fact.sourceCaptureId
    ? HELM_COPY.factSourceInferred(assistant, day)
    : HELM_COPY.factSourceInferredMail(assistant);
}
