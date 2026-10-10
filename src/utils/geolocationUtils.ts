export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Asks the browser for the current position (it prompts the person), rounded to about a kilometre. */
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
          new Error(
            error.code === error.PERMISSION_DENIED
              ? 'Location is turned off for this site.'
              : 'We couldn’t find your location just now.',
          ),
        ),
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}
