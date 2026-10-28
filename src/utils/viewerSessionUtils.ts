/** Removes what a person left in this browser when they sign out or another person signs in: unfinished-activity state under `<app>:<uid>:<name>-session`, and any draft a signed-out visitor kept under `<app>:signed-out-draft`. */
export const clearViewerSessions = (uid: string) => {
  try {
    Object.keys(window.localStorage)
      .filter(
        (key) =>
          (key.includes(`:${uid}:`) && key.endsWith('-session')) ||
          key.endsWith(':signed-out-draft'),
      )
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Browser storage is not available, so nothing was kept.
  }
};
