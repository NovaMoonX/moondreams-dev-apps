import { ENVELOPE_ORDER_STEP } from '@apps/runway/constants';
import type { VersionStretch } from '@apps/runway/engine/resolve';
import { getExtras, withExtras } from '@apps/runway/engine/parts';
import type {
  BillSealed,
  EnvelopeSealed,
  GroupSealed,
  Priority,
  PriorityExtra,
} from '@apps/runway/types';

type MemberPayload = BillSealed | EnvelopeSealed;
export type GroupSection = 'bill' | 'envelope';

export interface GroupPriorityMember {
  itemId: string;
  name: string;
  kind: GroupSection;
  stretches: VersionStretch<MemberPayload>[];
}

export interface GroupPriorityChange extends GroupPriorityMember {
  written: VersionStretch<MemberPayload>[];
  /** The priority it moves from, from the first stretch that changes tier, else null. */
  wasPriority: Priority | null;
  /** Its amount when extras fold into it, from the first stretch that has them: the main part and each extra. */
  folded: {
    priority: Priority;
    cents: number;
    extras: PriorityExtra[];
    totalCents: number;
  } | null;
}

/** The priority a group holds for its bills or its envelopes. */
export const getSectionPick = (group: GroupSealed, section: GroupSection) =>
  section === 'bill' ? group.startingPriority : group.envelopePriority;

/** The group with one section's pick (or both, for every section) set to `priority`. */
export const withSectionPick = (
  group: GroupSealed,
  sections: readonly GroupSection[],
  priority: Priority | null,
): GroupSealed => ({
  ...group,
  startingPriority: sections.includes('bill')
    ? priority
    : group.startingPriority,
  envelopePriority: sections.includes('envelope')
    ? priority
    : group.envelopePriority,
});

const getFoldedExtras = (payload: MemberPayload) =>
  'funding' in payload ? getExtras(payload) : [];

/** A stretch at `priority` with one amount: an envelope's extras fold into its main amount. */
const toSingleTier = (
  payload: MemberPayload,
  priority: Priority,
  orderIndex: number,
): MemberPayload =>
  'funding' in payload
    ? {
        ...payload,
        priority,
        orderIndex,
        funding: withExtras(payload),
        extras: null,
      }
    : { ...payload, priority, orderIndex };

/**
 * What putting members at `priority` writes: each member not already there with one amount, in every
 * stretch. One that moves tier is ranked after what the level holds (`firstRank`, then one step each, in
 * the order given); one already at the level keeps its rank and only folds its extras in.
 */
export function planGroupPriority(
  members: readonly GroupPriorityMember[],
  priority: Priority,
  firstRank: number,
): GroupPriorityChange[] {
  const open = members.filter(({ stretches }) =>
    stretches.some(
      ({ payload }) =>
        payload.priority !== priority || getFoldedExtras(payload).length > 0,
    ),
  );
  const movers = open.filter(({ stretches }) =>
    stretches.some(({ payload }) => payload.priority !== priority),
  );
  return open.map((member) => {
    const moverIndex = movers.indexOf(member);
    const moving = member.stretches.find(
      ({ payload }) => payload.priority !== priority,
    )?.payload;
    const withParts = member.stretches.find(
      ({ payload }) => getFoldedExtras(payload).length > 0,
    )?.payload;
    const extras = withParts ? getFoldedExtras(withParts) : [];
    const ownCents =
      withParts &&
      'funding' in withParts &&
      withParts.funding.amount.kind === 'exact'
        ? withParts.funding.amount.cents
        : 0;
    return {
      ...member,
      written: member.stretches.map((stretch) => ({
        ...stretch,
        payload: toSingleTier(
          stretch.payload,
          priority,
          moverIndex === -1
            ? stretch.payload.orderIndex
            : firstRank + moverIndex * ENVELOPE_ORDER_STEP,
        ),
      })),
      wasPriority: moving?.priority ?? null,
      folded:
        withParts === undefined
          ? null
          : {
              priority: withParts.priority,
              cents: ownCents,
              extras,
              totalCents:
                ownCents + extras.reduce((sum, extra) => sum + extra.cents, 0),
            },
    };
  });
}
