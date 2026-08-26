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
  const newReveals = asFiniteNumber(value.newReveals) ?? 0;
  const lastSurfacedAt = asFiniteNumber(value.lastSurfacedAt);
  const updatedAt = asFiniteNumber(value.updatedAt) ?? Date.now();

  return {
    userId,
    createdBoxes,
    updatedBoxes,
    newItems,
    newReveals,
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
  const referencePoint = lastSurfacedAt ?? Date.now();

  const createdBoxes = boxes.filter((box) => box.createdAt > referencePoint).length;
  const updatedBoxes = boxes.filter(
    (box) =>
      box.lastEditedAt > referencePoint &&
      box.createdAt !== box.lastEditedAt,
  ).length;
  const newItems = items.filter(
    (item) => item.authorId !== memberId && item.createdAt > referencePoint,
  ).length;
  const newReveals = items.filter(
    (item) => item.isRevealed && item.revealedAt !== null && item.revealedAt > referencePoint,
  ).length;

  return {
    userId: memberId,
    createdBoxes,
    updatedBoxes,
    newItems,
    newReveals,
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
    summary.newItems > 0 ||
    summary.newReveals > 0
  );
}
