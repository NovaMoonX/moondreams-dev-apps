import { queryOptions } from '@tanstack/react-query';

import { FIXTURE_USERS } from '@lib/dev/fixtureAccounts';

export const emulatorQueryKeys = {
  status: (authOrigin: string, projectId: string) =>
    ['emulator-status', authOrigin, projectId] as const,
};

export function emulatorStatusQueryOptions(authOrigin: string, projectId: string) {
  return queryOptions({
    queryKey: emulatorQueryKeys.status(authOrigin, projectId),
    queryFn: async () => {
      // `Bearer owner` is the emulator's admin bypass.
      const response = await fetch(
        `${authOrigin}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:query`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnUserInfo: true }),
        },
      );

      if (!response.ok) {
        throw new Error(`Auth emulator responded ${response.status}`);
      }

      const { userInfo = [] } = (await response.json()) as { userInfo?: { email?: string }[] };
      const emails = new Set(userInfo.map((user) => user.email));
      const isSeeded = Object.values(FIXTURE_USERS).every((account) => emails.has(account.email));
      const result = { isSeeded };
      return result;
    },
    retry: false,
    refetchInterval: 5_000,
  });
}
