import { ASSISTANT_TONES, DEFAULT_ASSISTANT_TONE } from '@apps/helm/constants';
import { useAppSelector } from '@/store';

/** How the assistant's answers sound: the person's pick when it is a known tone, else composed. */
export function useAssistantTone() {
  return useAppSelector(
    (state) =>
      ASSISTANT_TONES.find(
        (option) => option.value === state.helm.profile?.assistantTone,
      )?.value ?? DEFAULT_ASSISTANT_TONE,
  );
}
