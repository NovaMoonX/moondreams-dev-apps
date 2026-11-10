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

const toOnDay = (at: number, now: number) => {
  const day = toFactDay(at, now);
  return day === HELM_COPY.factToday || day === HELM_COPY.factYesterday
    ? day
    : `on ${day}`;
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
  return fact.sourceCaptureId
    ? HELM_COPY.factLineSaid(toFactDay(fact.createdAt, now))
    : HELM_COPY.factLineAdded(toFactDay(fact.createdAt, now));
}

const toLoose = (text: string) =>
  text
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim()
    .toLowerCase();

/** The person's own words for a fact, only when they say more than the fact does. */
export const getFactQuote = (fact: OpenFact) =>
  fact.quote && toLoose(fact.quote) !== toLoose(fact.statement)
    ? fact.quote
    : null;

/** The sheet's source line, which also says where the words came from. */
export function getFactSource(fact: OpenFact, assistant: string, now: number) {
  const day = toOnDay(fact.createdAt, now);
  if (fact.stated === 'personCorrected') {
    return HELM_COPY.factSourceCorrected(
      toOnDay(fact.confirmedAt ?? fact.createdAt, now),
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
      toOnDay(fact.confirmedAt ?? fact.createdAt, now),
    );
  }
  if (fact.sourceCaptureId) {
    return HELM_COPY.factSourceInferred(assistant, day);
  }
  return fact.sourceConnection
    ? HELM_COPY.factSourceInferredMail(assistant)
    : HELM_COPY.factSourceInferredOnly(assistant, day);
}
