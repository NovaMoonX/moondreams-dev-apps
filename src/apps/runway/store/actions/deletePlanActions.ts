import { reauthenticateWithPopup } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import { auth, functions, googleProvider } from '@lib/firebase/config';
import { queryClient } from '@lib/query/queryClient';

import { DELETE_PLAN_PHRASE, DELETE_PLAN_WORDS } from '@apps/runway/constants';
import { runwayQueryKeys } from '@apps/runway/queries/runwayKeyQueries';

const RECENT_SIGN_IN_MS = 4 * 60 * 1000;

const deleteRunwayPlanCallable = httpsCallable<
  { phrase: string },
  { deleted: number; receipts: number }
>(functions, 'deleteRunwayPlan');

/** The server is the judge of a recent sign-in; this only asks early, inside the tap, so the sign-in window is not blocked. */
async function ensureRecentSignIn() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to delete your plan.');
  const { authTime } = await user.getIdTokenResult();
  if (Date.now() - new Date(authTime).getTime() <= RECENT_SIGN_IN_MS) return;
  await reauthenticateWithPopup(user, googleProvider);
  await user.getIdToken(true);
}

export function isPhraseTyped(value: string) {
  const result =
    value.trim().toLowerCase().replace(/\s+/g, ' ') === DELETE_PLAN_PHRASE;
  return result;
}

/** Throws a sentence for the screen. Only a plan that was removed returns; the caller clears what the app holds. */
export async function deleteRunwayPlan(uid: string, phrase: string) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(DELETE_PLAN_WORDS.offline);
  }
  try {
    await ensureRecentSignIn();
    const response = await deleteRunwayPlanCallable({ phrase });
    queryClient.removeQueries({ queryKey: runwayQueryKeys.key(uid) });
    return response.data;
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (
      code === 'functions/unavailable' ||
      code === 'functions/deadline-exceeded'
    ) {
      throw new Error(
        'The delete could not reach the server. Check your connection and run it again; it picks up where it stopped.',
        { cause: error },
      );
    }
    if (code === 'functions/internal')
      throw new Error(DELETE_PLAN_WORDS.partial, { cause: error });
    if (code.startsWith('auth/')) {
      throw new Error(
        'Sign in again to delete your plan. Nothing has been removed.',
        { cause: error },
      );
    }
    throw error;
  }
}
