import {
  decryptStringForSpace,
  normalizeSpaceEncryption,
  type SpaceEncryption,
} from '../security';

import type { Box, RevealHistory, RevealMethod, RevealRequestedBy } from '../types';

export const RECENT_REVEAL_WINDOW_MS = 3_600_000;

const DEFAULT_BOX_SEEDS = [
  {
    name: 'Future Dates',
    emoji: '📅',
    description: 'Activities to try when we are ready.',
  },
  {
    name: 'Joys from Last Time',
    emoji: '✨',
    description: 'Shared memories to smile about.',
  },
  {
    name: 'Appreciations of Each Other',
    emoji: '💛',
    description: 'Small things noticed and loved about you.',
  },
  {
    name: 'Bedroom Desires',
    emoji: '🔥',
    description: 'Spicy thoughts or boundaries to explore.',
  },
  {
    name: 'Places to Travel Together',
    emoji: '✈️',
    description: 'Trip ideas, spots, or bucket list places.',
  },
  {
    name: 'Burning Questions',
    emoji: '❓',
    description: 'Deeper questions for the right moment.',
  },
  {
    name: 'Gentle Air-Clearing',
    emoji: '🌬️',
    description: 'Small things to work through when ready.',
  },
] as const;

export async function normalizeBox(
  id: string,
  data: Record<string, unknown>,
  encryption: SpaceEncryption | null = null,
): Promise<Box> {
  const requestedBy = Array.isArray(data.revealRequestedBy)
    ? data.revealRequestedBy.map((entry) => {
        const request = entry as Record<string, unknown>;

        return {
          userId: typeof request.userId === 'string' ? request.userId : '',
          method:
            request.method === 'full_reveal' || request.method === 'raffle'
              ? request.method
              : 'full_reveal',
          requestedAt:
            typeof request.requestedAt === 'number'
              ? request.requestedAt
              : Date.now(),
        } satisfies RevealRequestedBy;
      })
    : [];

  const history = Array.isArray(data.revealHistory)
    ? data.revealHistory.map((entry) => {
        const event = entry as Record<string, unknown>;

        return {
          id: typeof event.id === 'string' ? event.id : '',
          method:
            event.method === 'full_reveal' || event.method === 'raffle'
              ? event.method
              : 'full_reveal',
          triggeredBy:
            typeof event.triggeredBy === 'string' ? event.triggeredBy : '',
          revealedAt:
            typeof event.revealedAt === 'number' ? event.revealedAt : Date.now(),
          itemIds: Array.isArray(event.itemIds)
            ? event.itemIds.map((itemId) => String(itemId))
            : [],
        } satisfies RevealHistory;
      })
    : [];

  const normalizedEncryption =
    encryption ?? normalizeSpaceEncryption(data.encryption ?? null);

  const decryptedName = await decryptStringForSpace(data.name, normalizedEncryption);
  const decryptedEmoji = await decryptStringForSpace(data.emoji, normalizedEncryption);
  const decryptedDescription = await decryptStringForSpace(
    data.description,
    normalizedEncryption,
  );

  return {
    id,
    name: decryptedName || 'Untitled Box',
    emoji: decryptedEmoji.trim() || '✨',
    description: decryptedDescription || 'No description.',
    isDefault: Boolean(data.isDefault),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : 'system',
    revealRequestedBy: requestedBy,
    revealHistory: history,
    createdAt:
      typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    lastEditedAt:
      typeof data.lastEditedAt === 'number' ? data.lastEditedAt : Date.now(),
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getDefaultBoxes(now = Date.now()): Box[] {
  return DEFAULT_BOX_SEEDS.map((seed, index) => ({
    id: `default-${slugify(seed.name)}`,
    name: seed.name,
    emoji: seed.emoji,
    description: seed.description,
    isDefault: true,
    createdBy: 'system',
    revealRequestedBy: [],
    revealHistory: [],
    createdAt: now + index,
    lastEditedAt: now + index,
  }));
}

export function getFriendlyRevealMethod(method: RevealMethod, casing?: 'upper' | 'lower' | 'title'): string {
  switch (method) {
    case 'full_reveal':
      return casing === 'upper'
        ? 'FULL REVEAL'
        : casing === 'lower'
        ? 'full reveal'
        : 'Full Reveal';
    case 'raffle':
      return casing === 'upper'
        ? 'RAFFLE SINGLE ITEM'
        : casing === 'lower'
        ? 'raffle single item'
        : 'Raffle Single Item';
    default:
      return casing === 'upper'
        ? 'UNKNOWN'
        : casing === 'lower'
        ? 'unknown'
        : 'Unknown';
  }
}
