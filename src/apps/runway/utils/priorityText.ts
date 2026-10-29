import { PRIORITY_LABELS } from '@apps/runway/constants';
import type { PriorityAssignment } from '@apps/runway/engine/priorities';
import type { Priority } from '@apps/runway/types';

/** The change-log line for a saved order and the confirm step's subtitle: up to three moved items, each with where it went, then a count of the rest. */
export function describeReorder(
  assignments: readonly PriorityAssignment[],
  moved: ReadonlySet<string>,
  working: Readonly<Record<Priority, readonly string[]>>,
  originalTiers: ReadonlyMap<string, Priority>,
  nameOf: (itemId: string) => string,
) {
  const placed = assignments.filter((entry) => moved.has(entry.itemId));
  const describeOne = ({ itemId, tier }: PriorityAssignment) => {
    const name = nameOf(itemId);
    if (originalTiers.get(itemId) !== tier) {
      return `${name} to ${PRIORITY_LABELS[tier]}`;
    }
    const list = working[tier];
    const index = list.indexOf(itemId);
    if (index < list.length - 1)
      return `${name} above ${nameOf(list[index + 1])}`;
    return index > 0 ? `${name} below ${nameOf(list[index - 1])}` : name;
  };
  const shown = placed.slice(0, 3).map(describeOne);
  const rest = placed.length - shown.length;
  if (shown.length === 0) return 'Moved items';
  if (rest > 0) return `Moved ${shown.join(', ')} and ${rest} more`;
  if (shown.length === 1) return `Moved ${shown[0]}`;
  return `Moved ${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}
