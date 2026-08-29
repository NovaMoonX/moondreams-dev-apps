import { DocumentData } from 'firebase-admin/firestore';
import { decryptStringForSpace, SpaceEncryption } from '../security';
import { Item } from '../types';

export const RECENT_REVEAL_WINDOW_MS = 3_600_000;

export const getBoxItemCardElementId = (itemId: string) => `box-item-card-${itemId}`;

export function getWasRecentlyRevealed(item: Item): boolean {
  const now = Date.now();
  const hasRecentReveal =
    item.isRevealed &&
    item.revealedAt !== null &&
    now !== null &&
    item.revealedAt >= now - RECENT_REVEAL_WINDOW_MS;

  return hasRecentReveal;
}

export async function normalizeItem(
  id: string,
  data: DocumentData,
  encryption: SpaceEncryption | null,
): Promise<Item> {
  const revealedMethodValue = data.revealedMethod;

  return {
    id,
    authorId: typeof data.authorId === 'string' ? data.authorId : 'anonymous',
    content: await decryptStringForSpace(data.content, encryption),
    isRevealed: Boolean(data.isRevealed),
    revealedAt: typeof data.revealedAt === 'number' ? data.revealedAt : null,
    revealedMethod:
      revealedMethodValue === 'full_reveal' ||
      revealedMethodValue === 'raffle' ||
      revealedMethodValue === 'user_reveal'
        ? revealedMethodValue
        : null,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    lastEditedAt:
      typeof data.lastEditedAt === 'number' ? data.lastEditedAt : Date.now(),
  };
}
