import { doc, setDoc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

const routineRef = () => doc(db, 'adminSettings', 'claudeRoutine');
const statusRef = () => doc(db, 'adminSettings', 'claudeRoutineStatus');

/** Admin only: stores the routine's fire URL and token. The token is write-only from the client; only the Function reads it. */
export async function saveClaudeRoutine({
  fireUrl,
  token,
}: {
  fireUrl: string;
  token: string;
}): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(routineRef(), {
    fireUrl: fireUrl.trim(),
    token: token.trim(),
    updatedAt: now,
  });
  batch.set(statusRef(), { isConnected: true, updatedAt: now });
  await batch.commit();
}

/** Admin only: forgets the stored token. */
export async function disconnectClaudeRoutine(): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(routineRef());
  batch.set(statusRef(), { isConnected: false, updatedAt: Date.now() });
  await batch.commit();
}

/** Admin only: turns Claude working on feedback by itself on or off. */
export async function setFeedbackAutomation(isOn: boolean): Promise<void> {
  await setDoc(doc(db, 'adminSettings', 'feedbackAutomation'), {
    isOn,
    updatedAt: Date.now(),
  });
}
