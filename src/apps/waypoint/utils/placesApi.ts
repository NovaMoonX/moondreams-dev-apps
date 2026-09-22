import type { PlaceRef } from '@apps/waypoint/types';

/**
 * Thin client for Google Places API (New), called directly from the browser with a
 * restricted API key. No Cloud Functions round trip, so type-ahead stays fast.
 *
 * Autocomplete requests inside a session that ends in a Details call aren't
 * billed on their own, so a session token must be created per search and reused
 * for every keystroke plus the final Details call. Details is requested at the
 * Essentials field tier only (`formattedAddress,location,types`) — no
 * `displayName`/`googleMapsUri` (Pro) and no `photos` (a separately billed SKU).
 * The photo itself comes from a free scrape of the place's Maps page instead.
 */

const PLACES_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
}

export interface PlaceSelectionBias {
  latitude: number;
  longitude: number;
}

export interface PlaceSelectionResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  place: PlaceRef;
}

export function isPlacesSearchAvailable() {
  return Boolean(PLACES_API_KEY);
}

/** Finds a rough center point to bias place search toward: the first item in the
 * list (events or stays) that already has coordinates. */
export function getPlaceBiasFromItems(
  items: { latitude: number | null; longitude: number | null }[],
): PlaceSelectionBias | undefined {
  const withCoords = items.find(
    (item) => item.latitude !== null && item.longitude !== null,
  );
  return withCoords
    ? { latitude: withCoords.latitude as number, longitude: withCoords.longitude as number }
    : undefined;
}

export function createSessionToken() {
  return crypto.randomUUID();
}

export function buildMapsUrl(placeId: string) {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

interface AutocompleteSuggestionResponse {
  placePrediction?: {
    placeId: string;
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
    text?: { text?: string };
  };
}

export async function autocomplete(
  input: string,
  sessionToken: string,
  bias?: PlaceSelectionBias,
): Promise<PlaceSuggestion[]> {
  if (!PLACES_API_KEY || !input.trim()) {
    return [];
  }

  const body: Record<string, unknown> = { input, sessionToken };
  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.latitude, longitude: bias.longitude },
        radius: 50000,
      },
    };
  }

  const response = await fetch(`${PLACES_BASE_URL}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Place search failed (${response.status}).`);
  }

  const data = (await response.json()) as { suggestions?: AutocompleteSuggestionResponse[] };
  return (data.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction))
    .map((prediction) => ({
      placeId: prediction.placeId,
      primaryText:
        prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? '',
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? '',
    }));
}

interface PlaceDetailsResponse {
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
}

export async function getPlaceForSelection(
  placeId: string,
  name: string,
  sessionToken: string,
): Promise<PlaceSelectionResult | null> {
  if (!PLACES_API_KEY) {
    return null;
  }

  const url = new URL(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set('sessionToken', sessionToken);

  const response = await fetch(url.toString(), {
    headers: {
      'X-Goog-Api-Key': PLACES_API_KEY,
      'X-Goog-FieldMask': 'formattedAddress,location,types',
    },
  });

  if (!response.ok) {
    throw new Error(`Fetching place details failed (${response.status}).`);
  }

  const data = (await response.json()) as PlaceDetailsResponse;
  if (
    data.location?.latitude === undefined ||
    data.location.longitude === undefined
  ) {
    return null;
  }

  return {
    name,
    address: data.formattedAddress ?? '',
    latitude: data.location.latitude,
    longitude: data.location.longitude,
    place: {
      placeId,
      mapsUrl: buildMapsUrl(placeId),
      primaryType: data.types?.[0] ?? null,
      photoUrl: null,
      photoRefreshedAt: null,
    },
  };
}
