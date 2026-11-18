import { formatDateShortUTC } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { formatDayWord, shiftDayKey } from '@apps/helm/utils/planDays';

const dayAsWords = (until: string, today: string) =>
  until === today
    ? 'today'
    : until === shiftDayKey(today, 1)
      ? 'tomorrow'
      : formatDayWord(until, today);

/** "Until Sat, Nov 28" or "Until you turn it off". */
export const readQuietUntilLine = (until: string | null, today: string) =>
  until === null
    ? HELM_COPY.quietUntilOff
    : HELM_COPY.quietUntilDay(dayAsWords(until, today));

/** "until Nov 28" or "until you turn it off", for the end of a one-line state. */
export const readQuietEndClause = (until: string | null) =>
  until === null
    ? HELM_COPY.quietStateOpen
    : HELM_COPY.quietStateUntil(formatDateShortUTC(Date.parse(until)));

/** Soonest end first, open-ended last. */
export const compareQuietEnd = (left: string | null, right: string | null) =>
  left === right
    ? 0
    : left === null
      ? 1
      : right === null
        ? -1
        : left.localeCompare(right);
