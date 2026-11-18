import {
  CalendarDays,
  Clock,
  ListOrdered,
  Target,
  type LucideIcon,
} from 'lucide-react';

import { formatDateShortUTC } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenPattern, PatternKind, Weekday } from '@apps/helm/types';
import { formatWeekdayDayUTC } from '@apps/helm/utils/taskDue';

const REASON_ICONS: Partial<Record<PatternKind, LucideIcon>> = {
  tooManyGoals: Target,
  deadlineWontFit: Clock,
  starved: ListOrdered,
  busyStretch: CalendarDays,
};

export interface ReasonLine {
  kind: PatternKind;
  line: string;
  Icon: LucideIcon;
}

/** One line per reason, with its kind's icon; a pattern from before reasons has its one evidence line. */
export function readReasonLines(pattern: OpenPattern): ReasonLine[] {
  const lines = (pattern.reasonLine ?? pattern.evidenceLine).split('\n');
  const kinds =
    pattern.reasons.length > 0
      ? pattern.reasons.map((reason) => reason.kind)
      : [pattern.kind];
  return kinds.flatMap((kind, at) =>
    lines[at]
      ? [{ kind, line: lines[at], Icon: REASON_ICONS[kind] ?? Clock }]
      : [],
  );
}

/** The day a hold or pause ends (date-only), or null when it lasts until the person picks it back up. */
export const readPauseUntil = (pattern: OpenPattern) =>
  pattern.effect.kind === 'pause' ? pattern.effect.until : null;

/** Something just started is held itself, rather than another thing paused for it. */
export const isHoldingStarted = (pattern: OpenPattern) =>
  pattern.moment === 'onStart' &&
  pattern.subject.otherId !== null &&
  pattern.subject.otherId === pattern.subject.id;

export const isTaskGuardrail = (pattern: OpenPattern) =>
  pattern.subject.collection === 'tasks';

/** Where the hours in a deadline reason come from, in words; null when no reason counts hours. */
export function readHoursSource(pattern: OpenPattern): string | null {
  const deadline = pattern.reasons.find(
    (reason) => reason.kind === 'deadlineWontFit',
  );
  return deadline?.evidence.kind !== 'load'
    ? null
    : deadline.evidence.refs.includes('noCalendar')
      ? HELM_COPY.guardrailHoursNoCalendar
      : HELM_COPY.guardrailHoursFromCalendar;
}

/** A date-only day for a card's button ("Dec 1", held together so a button never wraps between month and day); null reads as no date. */
export const toShortDay = (day: number | null) =>
  day === null ? null : formatDateShortUTC(day).replaceAll(' ', '\u00a0');

/** A date-only day for a toast ("Tue, Dec 1"). */
export const toToastDay = (day: number | null) =>
  day === null ? null : formatWeekdayDayUTC(day);

export function readKeepDayLabel(pattern: OpenPattern): string {
  const refs = pattern.reasons.flatMap((reason) =>
    reason.kind === 'deadlineWontFit' && reason.evidence.kind === 'load'
      ? [reason.evidence.refs]
      : [],
  )[0];
  const day = Number(refs?.[1]);
  return Number.isFinite(day)
    ? HELM_COPY.guardrailKeepDay(
        HELM_COPY.habitWeekdaysLong[new Date(day).getUTCDay() as Weekday],
      )
    : HELM_COPY.guardrailKeepDate;
}
