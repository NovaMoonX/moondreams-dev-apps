/** A subview or sheet that unmounts steps its own history entry back, which would undo a URL change made first; this waits for that step. */
export function leaveAfterSubviewCloses(go: () => void) {
  const state = { isDone: false };
  const run = () => {
    if (state.isDone) return;
    state.isDone = true;
    window.removeEventListener('popstate', run);
    go();
  };
  window.addEventListener('popstate', run);
  setTimeout(run, 400);
}
