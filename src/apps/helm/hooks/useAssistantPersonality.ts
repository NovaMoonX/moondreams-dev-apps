import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import { readPersonality } from '@apps/helm/engine/personality';

/** How the assistant talks: the person's pick, else what their old tone read as. */
export function useAssistantPersonality() {
  const stored = useAppSelector((state) => state.helm.profile?.personality);
  const legacyTone = useAppSelector(
    (state) => state.helm.profile?.assistantTone,
  );
  return useMemo(
    () => readPersonality(stored ?? null, legacyTone ?? null),
    [stored, legacyTone],
  );
}
