import { join } from '@moondreamsdev/dreamer-ui/utils';

import type { DotKind } from '@apps/runway/utils/calendarDots';

const DOT_CLASSES: Record<DotKind, string> = {
  income: 'size-2 rounded-full bg-success',
  bill: 'size-2 rounded-full bg-muted-foreground',
  card: 'size-2 rounded-full bg-primary',
  goal: 'size-2 rounded-full border-2 border-foreground/70',
  goalBehind: 'size-2 rounded-full border-2 border-(--runway-warning-ink)',
  change: 'size-1.5 rotate-45 rounded-[1px] bg-foreground/70',
};

/** A small dot for one kind of thing on a calendar day; the goal kinds are rings and a plan change a diamond, so they differ by shape as well as colour. */
export function Dot({ kind }: { kind: DotKind }) {
  return (
    <span className={join('shrink-0', DOT_CLASSES[kind])} aria-hidden='true' />
  );
}
