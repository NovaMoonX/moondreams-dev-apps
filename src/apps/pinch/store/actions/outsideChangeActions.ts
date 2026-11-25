import { undoAppChange } from '@/lib/connections/connectionCalls';

/** Takes back an outside change; null once it is undone, else the sentence saying why it can't be. */
export const undoOutsideChange = async (
  changeId: string,
): Promise<string | null> => {
  const result = await undoAppChange({
    connectorId: 'app:pinch',
    changeId,
    from: 'pinch',
  });
  return result.ok ? null : result.message;
};
