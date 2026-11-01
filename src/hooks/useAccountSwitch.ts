import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import type { RememberedAccount } from '@/lib/auth/rememberedAccounts';

/** Switches to a remembered account, without Google when its session is kept on this device, or opens Google's picker (always for a new one) when given `null`; a failure says so in a toast. Call it from a tap. */
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
