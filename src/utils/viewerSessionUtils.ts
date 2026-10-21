/** Removes the unfinished-activity state a person left in this browser, kept under `<app>:<uid>:<name>-session`, when they sign out or another person signs in. */
export const clearViewerSessions = (uid: string) => {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.includes(`:${uid}:`) && key.endsWith('-session'))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Browser storage is not available, so nothing was kept.
  }
};
