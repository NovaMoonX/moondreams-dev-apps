import { HELM_COPY } from '@apps/helm/constants';
import type { KeyDateKind } from '@apps/helm/types';
import { formatYearlyDate, yearsOn } from '@/utils/yearlyDateUtils';

const lowerFirst = (text: string) =>
  /^[A-Z][a-z]/.test(text)
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;

/** "birthday", "anniversary", or the person's own label ("gotcha day"). */
export const toKeyDateWord = (kind: KeyDateKind, label: string | null) =>
  kind === 'birthday' || kind === 'anniversary'
    ? kind
    : lowerFirst(label?.trim() || 'date');

/** The row's lead word: "Birthday", "Anniversary" or the label as the person wrote it. */
export const toKeyDateTitleWord = (kind: KeyDateKind, label: string | null) =>
  kind === 'birthday'
    ? HELM_COPY.keyDateKindBirthday
    : kind === 'anniversary'
      ? HELM_COPY.keyDateKindAnniversary
      : label?.trim() || HELM_COPY.keyDateKindCustom;

/** Whose date it is, in words: "Maya's birthday", "Your birthday", "Your anniversary with Maya", "Miso's gotcha day". */
export function describeKeyDate(input: {
  kind: KeyDateKind;
  label: string | null;
  whoName: string;
  isSelf: boolean;
}) {
  const word = toKeyDateWord(input.kind, input.label);
  if (input.kind === 'anniversary') {
    return input.isSelf
      ? `${HELM_COPY.keyDateYours} ${word}`
      : `${HELM_COPY.keyDateYours} ${word}${HELM_COPY.keyDateWith(input.whoName)}`;
  }
  return input.isSelf
    ? `${HELM_COPY.keyDateYours} ${word}`
    : `${HELM_COPY.keyDateOwn(input.whoName)} ${word}`;
}

/** "Thu, Nov 12" for a date key. */
export const formatDayLabel = (key: string) =>
  new Date(Date.parse(key)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

const toWeekday = (key: string) =>
  new Date(Date.parse(key)).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });

const toMonthDay = (key: string) =>
  new Date(Date.parse(key)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/** The count on an occurrence: an age for a birthday, years for the rest; null with no year, or when it would not be above zero. */
export function countOn(
  entry: { kind: KeyDateKind; year: number | null },
  occurrence: string,
) {
  const years = yearsOn(entry, occurrence);
  return years !== null && years > 0 ? years : null;
}

/** A who page row: "Birthday · March 3, 1994 · turns 32 on Tue". */
export function formatKeyDateRow(
  entry: {
    kind: KeyDateKind;
    label: string | null;
    month: number;
    day: number | null;
    year: number | null;
  },
  occurrence: string | null,
) {
  const count = occurrence ? countOn(entry, occurrence) : null;
  const tail =
    occurrence === null || count === null
      ? null
      : entry.kind === 'birthday'
        ? HELM_COPY.keyDateTurns(count, toWeekday(occurrence))
        : HELM_COPY.keyDateYearsOn(count, toMonthDay(occurrence));
  return [
    toKeyDateTitleWord(entry.kind, entry.label),
    formatYearlyDate(entry),
    tail,
  ]
    .filter(Boolean)
    .join(' · ');
}
