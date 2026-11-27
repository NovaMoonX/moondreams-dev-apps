import { useDebouncedValue } from '@/hooks/useDebounce';

/** How long ticking has to pause before ticked lines move down, so a line never jumps away while the person is still tapping. */
const SETTLE_MS = 1500;

/** The ticked ids, as they were once ticking paused for a moment. */
export const useSettledTicks = (outIds: string[]) => {
  const settled = useDebouncedValue(outIds.join('\n'), SETTLE_MS);
  return new Set(settled === '' ? [] : settled.split('\n'));
};

/** Moves what is done below what is still to do, keeping each side's order. */
export const sinkDone = <T>(items: T[], isDone: (item: T) => boolean) => [
  ...items.filter((item) => !isDone(item)),
  ...items.filter(isDone),
];
