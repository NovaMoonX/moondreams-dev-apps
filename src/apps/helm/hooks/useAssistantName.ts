import { DEFAULT_ASSISTANT_NAME } from '@apps/helm/constants';
import { useAppSelector } from '@/store';
import { readAssistantName } from '@apps/helm/utils/assistantName';

/** The assistant's name: the person's own when it passes the name pattern, else the default. */
export function useAssistantName() {
  return useAppSelector(
    (state) =>
      readAssistantName(state.helm.profile?.assistantName) ??
      DEFAULT_ASSISTANT_NAME,
  );
}
