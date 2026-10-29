import { PRIORITY_LABELS } from '@apps/runway/constants';
import type { PriorityAssignment } from '@apps/runway/engine/priorities';
import type { Priority } from '@apps/runway/types';

/** The change-log line for a saved order: one move names its item and where it went, several count. */
export function describeReorder(
  assignments: readonly PriorityAssignment[],
  moved: ReadonlySet<string>,
  working: Readonly<Record<Priority, readonly string[]>>,
  originalTiers: ReadonlyMap<string, Priority>,
  nameOf: (itemId: string) => string,
) {
  const placed = assignments.filter((entry) => moved.has(entry.itemId));
  if (placed.length !== 1) return `Moved ${placed.length} items`;
  const { itemId, tier } = placed[0];
  const name = nameOf(itemId);
  if (originalTiers.get(itemId) !== tier) {
    return `Moved ${name} to ${PRIORITY_LABELS[tier]}`;
  }
  const list = working[tier];
  const index = list.indexOf(itemId);
  if (index < list.length - 1) {
    return `Moved ${name} above ${nameOf(list[index + 1])}`;
  }
  return index > 0
    ? `Moved ${name} below ${nameOf(list[index - 1])}`
    : `Moved ${name}`;
}
