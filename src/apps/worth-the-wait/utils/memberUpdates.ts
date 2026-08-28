import type { Box, Item, MemberUpdateSummary } from '../types';

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
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
  const createdBoxNames = asStringArray(value.createdBoxNames);
  const updatedBoxNames = asStringArray(value.updatedBoxNames);
  const newItemBoxNames = asStringArray(value.newItemBoxNames);
  const lastSurfacedAt = asFiniteNumber(value.lastSurfacedAt) ?? null;
  const updatedAt = asFiniteNumber(value.updatedAt) ?? Date.now();

  return {
    userId,
    createdBoxes,
    createdBoxNames,
    updatedBoxes,
    updatedBoxNames,
    newItems,
    newItemBoxNames,
    lastSurfacedAt,
    updatedAt,
  };
}

export function calculateMemberUpdateSummary({
  boxes,
  itemsByBoxId,
  memberId,
  lastSurfacedAt,
}: {
  boxes: Box[];
  itemsByBoxId: Record<string, Item[]>;
  memberId: string;
  lastSurfacedAt: number | null;
}): MemberUpdateSummary {
  if (lastSurfacedAt === null) {
    return {
      userId: memberId,
      createdBoxes: 0,
      createdBoxNames: [],
      updatedBoxes: 0,
      updatedBoxNames: [],
      newItems: 0,
      newItemBoxNames: [],
      lastSurfacedAt: null,
      updatedAt: 0,
    };
  }

  const referencePoint = lastSurfacedAt;
  const createdBoxMatches = boxes.filter(
    (box) => box.createdBy !== memberId && box.createdAt > referencePoint,
  );
  const updatedBoxMatches = boxes.filter(
    (box) =>
      box.createdBy !== memberId &&
      box.lastEditedAt > referencePoint &&
      box.createdAt !== box.lastEditedAt,
  );
  const newItemBoxNames = Array.from(
    new Set(
      Object.entries(itemsByBoxId)
        .filter(([boxId, items]) => {
          const box = boxes.find((candidate) => candidate.id === boxId);

          if (!box) {
            return false;
          }

          return items.some(
            (item) =>
              item.authorId !== memberId && item.createdAt > referencePoint,
          );
        })
        .map(([boxId]) => boxes.find((box) => box.id === boxId)?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  );
  const newItems = Object.values(itemsByBoxId)
    .flat()
    .filter(
      (item) => item.authorId !== memberId && item.createdAt > referencePoint,
    ).length;

  return {
    userId: memberId,
    createdBoxes: createdBoxMatches.length,
    createdBoxNames: createdBoxMatches.map((box) => box.name),
    updatedBoxes: updatedBoxMatches.length,
    updatedBoxNames: updatedBoxMatches.map((box) => box.name),
    newItems,
    newItemBoxNames,
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
