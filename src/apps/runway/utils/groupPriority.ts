import { ENVELOPE_ORDER_STEP, PRIORITIES } from '@apps/runway/constants';
import type { VersionStretch } from '@apps/runway/engine/resolve';
import type { BillSealed, EnvelopeSealed, Priority } from '@apps/runway/types';

type MemberPayload = BillSealed | EnvelopeSealed;

export interface GroupPriorityMember {
  itemId: string;
  name: string;
  kind: 'bill' | 'envelope';
  stretches: VersionStretch<MemberPayload>[];
}

export interface GroupPriorityChange extends GroupPriorityMember {
  written: VersionStretch<MemberPayload>[];
}

/** Whether an envelope's extras sit at or above `priority`; extras only live at levels below the envelope's own. */
const hasExtraAtOrAbove = (payload: MemberPayload, priority: Priority) =>
  'extras' in payload &&
  (payload.extras ?? []).some(
    (extra) => PRIORITIES.indexOf(extra.tier) <= PRIORITIES.indexOf(priority),
  );

/**
 * What putting a group's bills and envelopes at `priority` writes: each member that is not there already, in every
 * stretch, ranked after what the level holds (`firstRank`, then one step per member so they keep their order).
 * An envelope whose extras would no longer sit below its level is left alone and named in `skipped`.
 */
export function planGroupPriority(
  members: readonly GroupPriorityMember[],
  priority: Priority,
  firstRank: number,
): { changes: GroupPriorityChange[]; skipped: string[] } {
  const open = members.filter(
    ({ stretches }) =>
      !stretches.every(({ payload }) => payload.priority === priority),
  );
  const isBlocked = ({ stretches }: GroupPriorityMember) =>
    stretches.some(({ payload }) => hasExtraAtOrAbove(payload, priority));
  return {
    changes: open
      .filter((member) => !isBlocked(member))
      .map((member, index) => ({
        ...member,
        written: member.stretches.map((stretch) => ({
          ...stretch,
          payload: {
            ...stretch.payload,
            priority,
            orderIndex: firstRank + index * ENVELOPE_ORDER_STEP,
          },
        })),
      })),
    skipped: open.filter(isBlocked).map(({ name }) => name),
  };
}
