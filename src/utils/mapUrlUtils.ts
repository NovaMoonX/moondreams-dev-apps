interface MapLocation {
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** iPadOS reports itself as `MacIntel` with no way to tell it apart from desktop Safari except touch support. */
function isApplePlatform() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const platform = navigator.platform ?? '';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isIPadOS = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isDesktopMac = /Mac/.test(platform) && navigator.maxTouchPoints === 0;

  return isIOS || isIPadOS || isDesktopMac;
}

export function getMapNavigationUrl(location: MapLocation) {
  const query = [location.locationName, location.address].filter(Boolean).join(', ');
  if (!query && (location.latitude === null || location.longitude === null)) {
    return null;
  }

  const destination =
    location.latitude !== null && location.longitude !== null
      ? `${location.latitude},${location.longitude}`
      : encodeURIComponent(query);

  if (isApplePlatform()) {
    return `maps://maps.apple.com/?${location.latitude !== null && location.longitude !== null ? `ll=${destination}&q=${encodeURIComponent(query)}` : `q=${destination}`}`;
  }

  return `https://maps.google.com/?q=${destination}`;
}

export function openMapNavigation(location: MapLocation) {
  const url = getMapNavigationUrl(location);
  if (url) {
    window.location.assign(url);
  }
}
