import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useShake } from '@hooks/useShake';
import { useAuth } from '@hooks/useAuth';
import { getRegistryAppForPath } from '@lib/app';
import { buildFeedbackContext } from '@lib/feedback/feedbackWrites';
import { toSafeFeedbackPath } from '@lib/feedback/feedbackPath';
import type { FeedbackContext, FeedbackKind } from '@lib/feedback/types';
import { isMotionAllowed } from '@lib/motion/motionPermission';

import FeedbackSheet from './FeedbackSheet';
import { FeedbackSheetContext } from './feedbackSheetContext';

interface SheetRequest {
  id: number;
  startKind: FeedbackKind | null;
  context: FeedbackContext;
}

/** Mounted once in the site layout: owns the feedback sheet, opens it on a shake, and lets any screen open it through `useFeedbackSheet`. Signed out, nothing opens. */
function FeedbackLauncher({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [request, setRequest] = useState<SheetRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isShakeOn, setIsShakeOn] = useState(isMotionAllowed);

  const open = (startKind: FeedbackKind | null) => {
    if (!user || isOpen) return;
    setRequest({
      id: Date.now(),
      startKind,
      context: buildFeedbackContext({
        appId: getRegistryAppForPath(pathname)?.id ?? null,
        path: toSafeFeedbackPath(pathname),
      }),
    });
    setIsOpen(true);
  };

  useShake(() => open('bug'), { isEnabled: user !== null && isShakeOn });

  return (
    <FeedbackSheetContext.Provider value={{ open }}>
      {children}
      {request && user ? (
        <FeedbackSheet
          key={request.id}
          isOpen={isOpen}
          startKind={request.startKind}
          context={request.context}
          isShakeOn={isShakeOn}
          onShakeEnabled={() => setIsShakeOn(true)}
          onShakeOff={() => setIsShakeOn(false)}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </FeedbackSheetContext.Provider>
  );
}

export default FeedbackLauncher;
