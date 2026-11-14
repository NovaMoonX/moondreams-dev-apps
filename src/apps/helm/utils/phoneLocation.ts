import type { LocationPermission, PhoneLocation } from '@apps/helm/types';

export type PositionFailure = 'denied' | 'failed';

/** The browser's geolocation permission, read without prompting. */
export async function readLocationPermission(): Promise<LocationPermission> {
  if (!('geolocation' in navigator)) return 'unsupported';
  if (!navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'prompt';
  }
}

/** One fix from the browser; Precise asks for high accuracy. Rejects with the failure kind. */
export const readPosition = (level: Exclude<PhoneLocation, 'off'>) =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject('failed' satisfies PositionFailure);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) =>
        reject(
          (error.code === error.PERMISSION_DENIED
            ? 'denied'
            : 'failed') satisfies PositionFailure,
        ),
      {
        enableHighAccuracy: level === 'precise',
        timeout: 10_000,
        maximumAge: 5 * 60_000,
      },
    );
  });

export const roundTo3 = (value: number) => Math.round(value * 1000) / 1000;
