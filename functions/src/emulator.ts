/** True only inside the Firebase Emulator Suite, never on a deployed function. The emulator sets `K_SERVICE` like Cloud Run does, so only its hub address tells them apart. */
export const isRunningInEmulator = () =>
  process.env.FUNCTIONS_EMULATOR === 'true' &&
  Boolean(process.env.FIREBASE_EMULATOR_HUB);
