import { useMemo } from 'react';

import { DEFAULT_ASSISTANT_NAME } from '@apps/helm/constants';
import { useAppSelector } from '@/store';
import { readAssistantName } from '@apps/helm/utils/assistantName';

/** The saved ways a recognizer may write the assistant's name, as one stable string so a selector never re-renders on an equal list. */
export function useAssistantNameVariants() {
  const joined = useAppSelector(
    (state) => state.helm.profile?.assistantNameVariants?.join('\n') ?? '',
  );
  return useMemo(() => (joined === '' ? [] : joined.split('\n')), [joined]);
}

/** The assistant's name:the person's own when it passes the name pattern, else the default. */
export function useAssistantName() {
  return useAppSelector(
    (state) =>
      readAssistantName(state.helm.profile?.assistantName) ??
      DEFAULT_ASSISTANT_NAME,
  );
}
