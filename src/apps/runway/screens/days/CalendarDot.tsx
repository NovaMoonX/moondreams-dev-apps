import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { DotKind } from '@apps/runway/utils/calendarDots';

const DOT_CLASSES: Record<DotKind, string> = {
  income: 'bg-success',
  bill: 'bg-muted-foreground',
  card: 'bg-primary',
  goal: 'border-2 border-foreground/70',
  goalBehind: 'border-2 border-(--runway-warning-ink)',
};

/** A small dot for one kind of thing on a calendar day; the goal kinds are rings so they differ by shape as well as colour. */
export function Dot({ kind }: { kind: DotKind }) {
  return (
    <span
      className={join('size-2 shrink-0 rounded-full', DOT_CLASSES[kind])}
      aria-hidden='true'
    />
  );
}
