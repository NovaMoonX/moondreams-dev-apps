import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { selectIsGateOpen, setFeatureGatesDoc } from '@store/slices/featureGatesSlice';
import { startFeatureGatesListener } from '@lib/gates/featureGates';
import { getAppFeatureGates } from '@lib/gates/gates.registry';

/** Keeps an app's feature switches in the store while mounted; call it once in the app's shell. */
export function useFeatureGatesSync(appId: string, uid: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (uid === null) return;
    return startFeatureGatesListener(appId, (gatesDoc) =>
      dispatch(setFeatureGatesDoc({ appId, gatesDoc })),
    );
  }, [appId, uid, dispatch]);
}

export function useIsGateOpen(appId: string, gateId: string) {
  return useAppSelector((state) => selectIsGateOpen(state, appId, gateId));
}

/** Whether any of the app's switches is off for the signed-in person. */
export function useHasGatesClosed(appId: string) {
  return useAppSelector((state) =>
    getAppFeatureGates(appId).some((gate) => !selectIsGateOpen(state, appId, gate.id)),
  );
}
