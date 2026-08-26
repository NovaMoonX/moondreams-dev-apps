import type { Box, Item, MemberUpdateSummary } from '../types';

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

export function normalizeMemberUpdateSummary(
  value: Record<string, unknown> | null | undefined,
  userId: string,
): MemberUpdateSummary | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const createdBoxes = asFiniteNumber(value.createdBoxes) ?? 0;
  const updatedBoxes = asFiniteNumber(value.updatedBoxes) ?? 0;
  const newItems = asFiniteNumber(value.newItems) ?? 0;
  const lastSurfacedAt = asFiniteNumber(value.lastSurfacedAt) ?? null;
  const updatedAt = asFiniteNumber(value.updatedAt) ?? Date.now();

  return {
    userId,
    createdBoxes,
    updatedBoxes,
    newItems,
    lastSurfacedAt,
    updatedAt,
  };
}

export function calculateMemberUpdateSummary({
  boxes,
  items,
  memberId,
  lastSurfacedAt,
}: {
  boxes: Box[];
  items: Item[];
  memberId: string;
  lastSurfacedAt: number | null;
}): MemberUpdateSummary {
  if (lastSurfacedAt === null) {
    return {
      userId: memberId,
      createdBoxes: 0,
      updatedBoxes: 0,
      newItems: 0,
      lastSurfacedAt: null,
      updatedAt: 0,
    };
  }

  const referencePoint = lastSurfacedAt;

  const createdBoxes = boxes.filter(
    (box) => box.createdBy !== memberId && box.createdAt > referencePoint,
  ).length;
  const updatedBoxes = boxes.filter(
    (box) =>
      box.createdBy !== memberId &&
      box.lastEditedAt > referencePoint &&
      box.createdAt !== box.lastEditedAt,
  ).length;
  const newItems = items.filter(
    (item) => item.authorId !== memberId && item.createdAt > referencePoint,
  ).length;

  return {
    userId: memberId,
    createdBoxes,
    updatedBoxes,
    newItems,
    lastSurfacedAt,
    updatedAt: Date.now(),
  };
}

export function hasMemberUpdateSummary(summary: MemberUpdateSummary | null): boolean {
  if (!summary) {
    return false;
  }

  return (
    summary.createdBoxes > 0 ||
    summary.updatedBoxes > 0 ||
    summary.newItems > 0
  );
}
