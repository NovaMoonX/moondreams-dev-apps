export type SignOutQuestion = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
};

type SignOutCheck = (uid: string) => Promise<SignOutQuestion | null>;

const checks = new Set<SignOutCheck>();

/** Lets a feature that keeps something only on this device ask before sign-out clears it; returns how to stop asking. */
export function registerSignOutCheck(check: SignOutCheck) {
  checks.add(check);
  return () => {
    checks.delete(check);
  };
}

/** What the registered checks want to ask the person before this account signs out; a check that fails asks nothing. */
export async function getSignOutQuestions(uid: string) {
  const answers = await Promise.all(
    Array.from(checks, (check) => check(uid).catch(() => null)),
  );
  return answers.filter((answer) => answer !== null);
}
