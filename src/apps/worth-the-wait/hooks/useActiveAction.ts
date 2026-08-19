import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@lib/firebase/config';

import type { ActiveAction, RevealMethod } from '../types';

function normalizeActiveAction(value: unknown): ActiveAction | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const action = value as Record<string, unknown>;
  const method =
    action.method === 'full_reveal' || action.method === 'raffle'
      ? action.method
      : null;
  const status =
    action.status === 'initiating' ||
    action.status === 'executing' ||
    action.status === 'completed'
      ? action.status
      : 'completed';

  if (!method) {
    return null;
  }

  const selectedItemIds = Array.isArray(action.selectedItemIds)
    ? action.selectedItemIds.map(String)
    : [];

  const startedAt =
    typeof action.startedAt === 'number'
      ? action.startedAt
      : typeof action.startedAt === 'object' &&
          action.startedAt &&
          'seconds' in action.startedAt
        ? Number((action.startedAt as { seconds: number }).seconds) * 1000
        : Date.now();

  const completedAtValue = action.completedAt;
  const completedAt =
    typeof completedAtValue === 'number'
      ? completedAtValue
      : typeof completedAtValue === 'object' &&
          completedAtValue &&
          'seconds' in completedAtValue
        ? Number((completedAtValue as { seconds: number }).seconds) * 1000
        : null;

  return {
    actionId: typeof action.actionId === 'string' ? action.actionId : '',
    boxId: typeof action.boxId === 'string' ? action.boxId : '',
    method: method as RevealMethod,
    status,
    selectedItemIds,
    initiatedBy:
      typeof action.initiatedBy === 'string' ? action.initiatedBy : '',
    startedAt,
    completedAt,
  };
}

export function useActiveAction(spaceId: string) {
  const [spaceId_, setSpaceId_] = useState(spaceId);
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [loading, setLoading] = useState(Boolean(spaceId));
  const [error, setError] = useState<string | null>(null);

  if (spaceId !== spaceId_) {
    setSpaceId_(spaceId);
    setActiveAction(null);
    setLoading(Boolean(spaceId));
    setError(null);
  }

  useEffect(() => {
    if (!spaceId) {
      return;
    }

    const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', spaceId);
    let isActive = true;

    const unsubscribe = onSnapshot(
      spaceRef,
      (snapshot) => {
        if (!isActive) {
          return;
        }

        const data = (snapshot.data() as DocumentData | undefined) ?? null;
        const nextAction =
          data && typeof data.activeAction === 'object'
            ? normalizeActiveAction(data.activeAction)
            : null;

        setActiveAction(nextAction);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        if (!isActive) {
          return;
        }

        setError(snapshotError.message);
        setLoading(false);
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [spaceId]);

  return { activeAction, loading, error };
}

export default useActiveAction;
