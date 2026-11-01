import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';

/** Switches to a remembered account, or adds one when given `null`; a failure shows a toast. Tap handlers only. */
export function useAccountSwitch() {
  const { switchAccount } = useAuth();
  const { addToast } = useToast();

  return (account: RememberedAccount | null) => {
    switchAccount(account).catch((error: unknown) =>
      addToast({
        title: "Couldn't switch accounts",
        description: error instanceof Error ? error.message : 'Please try again.',
        type: 'error',
      }),
    );
  };
}
