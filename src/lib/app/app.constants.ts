export const APP_TITLE = 'MoonDreams App';
export const APP_DESCRIPTION =
  'A collection of mini-apps built to fit whatever felt useful, fun, or simply interesting during a particular moment in life.';

export const ADMIN_EMAIL = 'nova@moondreams.dev';

// Site-wide version, shared across every mini-app. The merge workflow works it out and injects it at build time; local builds read 'dev'.
export const SITE_VERSION =
  typeof __SITE_VERSION__ === 'string' ? __SITE_VERSION__ : 'dev';
