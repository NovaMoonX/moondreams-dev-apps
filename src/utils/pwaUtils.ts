// `fullscreen` is left out: it also matches a browser tab put into fullscreen.
const INSTALLED_DISPLAY_MODES = ['standalone', 'minimal-ui', 'window-controls-overlay'];

function detectInstalledApp() {
  if (typeof window === 'undefined') return false;

  const isIosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const hasInstalledDisplayMode = INSTALLED_DISPLAY_MODES.some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );

  const result = isIosStandalone || hasInstalledDisplayMode;
  return result;
}

/** True when the page runs in an installed app's own window, not a browser tab; fixed for the life of the page. */
export const IS_INSTALLED_APP = detectInstalledApp();
