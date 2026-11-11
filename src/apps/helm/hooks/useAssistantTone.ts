import { DEFAULT_ASSISTANT_TONE } from '@apps/helm/constants';
import { useAppSelector } from '@/store';

/** How the assistant's answers sound: the person's pick, else composed. */
export function useAssistantTone() {
  return useAppSelector(
    (state) => state.helm.profile?.assistantTone ?? DEFAULT_ASSISTANT_TONE,
  );
}
