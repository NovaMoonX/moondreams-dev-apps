export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** The rejection `getCurrentCoordinates` gives when the person or the browser refused, as opposed to a timeout or no fix. */
export const LOCATION_DENIED = 'location-denied';

/** Asks the browser for the current position (it prompts the person), rounded to about a kilometre; a refusal rejects with `cause` `LOCATION_DENIED`. */
export function getCurrentCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser can’t share your location.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: Math.round(position.coords.latitude * 100) / 100,
          longitude: Math.round(position.coords.longitude * 100) / 100,
        }),
      (error) =>
        reject(
          error.code === error.PERMISSION_DENIED
            ? new Error('Location is turned off for this site.', {
                cause: LOCATION_DENIED,
              })
            : new Error('We couldn’t find your location just now.'),
        ),
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}
