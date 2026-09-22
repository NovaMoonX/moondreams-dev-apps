/** A Google Places (New) pick, resolved once at selection time and stored on
 * whatever doc references it. Only `placeId` is safe to keep indefinitely per
 * Google's terms — the rest is refreshed on a cooldown rather than treated as
 * permanent (see `EnrichedImage`'s refresh policy). */
export interface PlaceRef {
  placeId: string;
  mapsUrl: string;
  primaryType: string | null;
  photoUrl: string | null;
  photoRefreshedAt: number | null;
}

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
