/** True only inside the Firebase Emulator Suite, never on a deployed function. The emulator sets `K_SERVICE` like Cloud Run does, so only its hub address tells them apart. */
export const isRunningInEmulator = () =>
  process.env.FUNCTIONS_EMULATOR === 'true' &&
  Boolean(process.env.FIREBASE_EMULATOR_HUB);

/** Services `LOCAL_FIXTURES` (`all` or a comma list, in `functions/.env.local`) can force onto fixtures. Emulators only. */
export const FIXTURE_SERVICES = [
  'anthropic',
  'deepgram',
  'google-tts',
  'gemini',
  'omdb',
  'tmdb',
  'amc',
  'plaid',
] as const;

export type FixtureService = (typeof FIXTURE_SERVICES)[number];

/** True when the emulator was told to answer this outside service from fixtures even if a key exists. Never true on a deployed function. */
export const isForcedFixture = (service: FixtureService) => {
  if (!isRunningInEmulator()) return false;
  const names = (process.env.LOCAL_FIXTURES ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase());
  return names.includes('all') || names.includes(service);
};
