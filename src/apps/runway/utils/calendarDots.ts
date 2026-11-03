import type { CalendarEntry } from '@apps/runway/engine/dayCalendar';

export type DotKind = 'income' | 'bill' | 'card' | 'goal' | 'goalBehind';

export const getDotKind = (entry: CalendarEntry): DotKind =>
  entry.kind === 'goal' && entry.track === 'behind' ? 'goalBehind' : entry.kind;
