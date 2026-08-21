import { useMemo } from 'react';

import type { ActiveAction } from '../types';

const REVEAL_STEP_MS = 160;
const HERE_WE_GO_MS = 1000;

function getRevealOrder(content: string, seedValue: number) {
  const eligibleIndexes = Array.from(content)
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => /[A-Za-z0-9]/.test(char))
    .map(({ index }) => index);

  if (eligibleIndexes.length <= 1) {
    return eligibleIndexes;
  }

  let seed = seedValue;
  const result = [...eligibleIndexes];

  for (let i = result.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const swapIndex = seed % (i + 1);
    [result[i], result[swapIndex]] = [result[swapIndex], result[i]];
  }

  return result;
}

interface UseRaffleRevealOptions {
  content: string | null;
  status?: ActiveAction['status'];
  completedAt?: number | null;
  now: number;
}

export function useRaffleReveal({
  content,
  status,
  completedAt,
  now,
}: UseRaffleRevealOptions) {
  const raffleRevealResult = useMemo(() => {
    if (!status || !completedAt || !content || status !== 'completed') {
      return {
        phase: 'shuffling' as const,
        displayText: 'Shuffling your shared thoughts...',
        revealedLetterCount: 0,
        revealOrder: [] as number[],
      };
    }

    const revealSeed = (completedAt ?? now) + content.length * 97;
    const revealOrder = getRevealOrder(content, revealSeed);

    const elapsedSinceCompletion = now - (completedAt ?? now);
    if (elapsedSinceCompletion < HERE_WE_GO_MS) {
      return {
        phase: 'here-we-go' as const,
        displayText: 'done :)',
        revealedLetterCount: 0,
        revealOrder,
      };
    }

    const revealStartAt = (completedAt ?? now) + HERE_WE_GO_MS;
    const revealElapsedMs = Math.max(0, now - revealStartAt);
    const revealedLetterCount = Math.min(
      revealOrder.length,
      Math.max(0, Math.floor(revealElapsedMs / REVEAL_STEP_MS)),
    );
    const revealedIndices = new Set(revealOrder.slice(0, revealedLetterCount));

    const displayText = Array.from(content)
      .map((char, index) => {
        if (char === ' ') {
          return ' ';
        }

        if (!/[A-Za-z0-9]/.test(char)) {
          return char;
        }

        return revealedIndices.has(index) ? char : '_';
      })
      .join('');

    return {
      phase: 'revealing' as const,
      displayText,
      revealedLetterCount,
      revealOrder,
    };
  }, [completedAt, content, now, status]);

  return raffleRevealResult;
}

export default useRaffleReveal;
