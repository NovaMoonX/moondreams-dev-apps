import {
  formatClockTime,
  formatDateShort,
  formatDateShortUTC,
} from '@/utils/formatUtils';
import { HELM_COPY, PATTERN_BACKOFF_WEEKS } from '@apps/helm/constants';
import type { OpenPattern } from '@apps/helm/types';

export interface PatternStateWords {
  /** The short state that ends a row's muted line. */
  line: string;
  /** The state in a sentence, with its date, for the sheet. */
  sentence: string;
  /** Asked of the person, so it is drawn in the accent. */
  isAsking: boolean;
}

/** The state of a pattern in the person's words, each with the date that matters. */
export function readStateWords(
  pattern: OpenPattern,
  assistant: string,
): PatternStateWords {
  const copy = HELM_COPY.noticedStateWords;
  if (pattern.offReason !== null)
    return {
      line: HELM_COPY.noticedStateStopped,
      sentence: copy.stopped(assistant),
      isAsking: false,
    };
  if (pattern.state === 'accepted') {
    const date = formatDateShort(pattern.stateAt);
    return pattern.acceptedBy === 'auto' && pattern.undoneByExecutionId === null
      ? {
          line: HELM_COPY.noticedStateChanged(assistant, date),
          sentence: copy.changed(assistant, date),
          isAsking: false,
        }
      : {
          line: HELM_COPY.noticedStateKept(date),
          sentence: copy.kept(date),
          isAsking: false,
        };
  }
  if (pattern.state === 'declined' || pattern.state === 'undone') {
    const date =
      pattern.nextEligibleOn === null
        ? null
        : formatDateShortUTC(pattern.nextEligibleOn);
    return date === null
      ? {
          line: HELM_COPY.noticedStateStopped,
          sentence: copy.stopped(assistant),
          isAsking: false,
        }
      : {
          line: HELM_COPY.noticedStateNotNow(date),
          sentence: copy.notNow(date),
          isAsking: false,
        };
  }
  if (pattern.state === 'retired')
    return {
      line: HELM_COPY.noticedStateRetired,
      sentence: copy.retired,
      isAsking: false,
    };
  return pattern.state === 'suggested'
    ? {
        line: HELM_COPY.noticedStateAsking,
        sentence: copy.asking(assistant),
        isAsking: true,
      }
    : {
        line: HELM_COPY.noticedStateNoticed,
        sentence: copy.noticed(assistant),
        isAsking: false,
      };
}

export interface PatternYes {
  label: string;
  subtitle: string | null;
  /** True when saying yes changes something by itself; false when the person has to make the change (a time, a plan). */
  isDirect: boolean;
}

/** What "yes" is named for, by the change it makes; none for care and for what has no change of its own. */
export function readYes(pattern: OpenPattern): PatternYes | null {
  if (pattern.handling === 'askOnly') return null;
  const { effect } = pattern;
  const names = HELM_COPY.noticedYes;
  const subtitles = HELM_COPY.noticedYesSubtitle;
  if (effect.kind === 'moveWindow')
    return {
      label: names.moveWindow(formatClockTime(effect.start)),
      subtitle: subtitles.moveWindow,
      isDirect: true,
    };
  if (effect.kind === 'lowerCadence' || effect.kind === 'raiseCadence')
    return {
      label: names[effect.kind],
      subtitle: subtitles[effect.kind],
      isDirect: true,
    };
  if (effect.kind === 'keepTime')
    return {
      label: names.keepTime,
      subtitle: subtitles.keepTime,
      isDirect: true,
    };
  if (effect.kind === 'talkItThrough')
    return { label: names.talkItThrough, subtitle: null, isDirect: false };
  return null;
}

/** The weeks the next "Not now" waits, or null when it is the third and final one. */
export const readNotNowWeeks = (pattern: Pick<OpenPattern, 'declineCount'>) =>
  PATTERN_BACKOFF_WEEKS[pattern.declineCount] ?? null;
