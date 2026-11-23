import { useDiscardGuard } from '@/hooks/useDiscardGuard';

interface UseLeaveFlowGuardOptions {
  /** The person has done anything in this visit: picked, typed, saved or moved a step. */
  hasActed: boolean;
  onLeave: () => void;
  title?: string;
  /** What leaving keeps and what it loses, in a sentence or two. */
  message: string;
  /** Leaving loses typed work, so Leave is drawn as destructive. */
  isLosingWork?: boolean;
}

/** The one way out of a guided flow: asks Keep going / Leave once the person has done anything in it, and leaves at once otherwise. Pass it to every route out (the header arrow, the back gesture, a footer Exit). */
export function useLeaveFlowGuard({
  hasActed,
  onLeave,
  title = 'Leave the setup?',
  message,
  isLosingWork = false,
}: UseLeaveFlowGuardOptions) {
  return useDiscardGuard({
    isDirty: hasActed,
    onClose: onLeave,
    title,
    message,
    confirmText: 'Leave',
    cancelText: 'Keep going',
    isDestructive: isLosingWork,
  });
}
