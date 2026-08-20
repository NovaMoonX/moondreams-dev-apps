import { doc, updateDoc } from 'firebase/firestore';
import { useCallback, useState } from 'react';

import { db } from '@lib/firebase/config';

import type { Space } from '../types';

interface WelcomeModalUser {
  uid: string;
}

export function useWelcomeModal(
  space: Space | null,
  user: WelcomeModalUser | null,
) {
  const [isManualOpen, setIsManualOpen] = useState(false);

  const hasSeenWelcome = Boolean(
    user &&
    space &&
    space.members.includes(user.uid) &&
    space.welcomeSeenBy?.[user.uid],
  );
  const shouldShowWelcome = Boolean(
    user && space && space.members.includes(user.uid) && !hasSeenWelcome,
  );
  const isOpen = shouldShowWelcome || isManualOpen;

  const close = useCallback(async () => {
    const shouldPersistSeenState = !isManualOpen && shouldShowWelcome;

    setIsManualOpen(false);

    if (!shouldPersistSeenState || !space || !user) {
      return;
    }

    const spaceRef = doc(db, 'apps', 'worth-the-wait', 'spaces', space.id);
    await updateDoc(spaceRef, {
      welcomeSeenBy: {
        ...(space.welcomeSeenBy ?? {}),
        [user.uid]: Date.now(),
      },
      updatedAt: Date.now(),
    });
  }, [isManualOpen, shouldShowWelcome, space, user]);

  const openManual = useCallback(() => {
    setIsManualOpen(true);
  }, []);

  return {
    shouldShowWelcome,
    isOpen,
    openManual,
    close,
  };
}
