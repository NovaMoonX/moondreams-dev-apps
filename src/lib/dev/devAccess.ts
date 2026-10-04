import type { User } from 'firebase/auth';

import { app, emulatorAuthOrigin, isUsingFirebaseEmulators } from '@lib/firebase/config';

/** Gives a fake-Google user the `dev` claim seeded fixtures carry, so the rules let them see every app. Emulators only. */
export async function grantEmulatorDevAccess(user: User) {
  if (!isUsingFirebaseEmulators || !emulatorAuthOrigin) {
    return;
  }

  const { claims } = await user.getIdTokenResult();
  if (claims.dev === true) {
    return;
  }

  const response = await fetch(
    `${emulatorAuthOrigin}/identitytoolkit.googleapis.com/v1/projects/${app.options.projectId}/accounts:update`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: user.uid, customAttributes: JSON.stringify({ dev: true }) }),
    },
  );

  if (!response.ok) {
    throw new Error(`The Auth emulator responded ${response.status}`);
  }

  await user.getIdToken(true);
}
