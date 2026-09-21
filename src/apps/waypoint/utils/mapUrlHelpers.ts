interface MapLocation {
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

function isApplePlatform() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
    return `https://maps.apple.com/?${location.latitude !== null && location.longitude !== null ? `ll=${destination}&q=${encodeURIComponent(query)}` : `q=${destination}`}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

export function openMapNavigation(location: MapLocation) {
  const url = getMapNavigationUrl(location);
  if (url) {
    window.location.assign(url);
  }
}
