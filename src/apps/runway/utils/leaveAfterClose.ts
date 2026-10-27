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

/** A screen opened over a layer about to close would take that layer's history entry, so Back would skip the layer; a plain entry pushed first keeps it. Only when the URL carries `param`. */
export function keepEntryFor(param: string) {
  if (!new URLSearchParams(window.location.search).has(param)) return;
  const { backLayerKey, backLayerSeq, ...entry } = window.history.state ?? {};
  void backLayerKey;
  void backLayerSeq;
  window.history.pushState({ ...entry, keptFor: param }, '');
}
