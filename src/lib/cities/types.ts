export interface City {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  /** IANA zone of the city, when the provider knows it. */
  timezone: string | null;
}
