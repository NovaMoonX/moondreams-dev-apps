export type WeatherConditionId =
  | 'clear'
  | 'partly-sunny'
  | 'overcast'
  | 'foggy'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'thunderstorms'
  | 'unknown';

export interface WeatherCondition {
  id: WeatherConditionId;
  label: string;
  emoji: string;
  /** The fog emoji reads as a smudged square, so fog is a cloud with mist lines drawn under it. */
  hasMist?: boolean;
}

const UNKNOWN: WeatherCondition = { id: 'unknown', label: 'Forecast', emoji: '🌡️' };

const CONDITIONS: { codes: number[]; condition: WeatherCondition }[] = [
  { codes: [0], condition: { id: 'clear', label: 'Clear skies', emoji: '☀️' } },
  { codes: [1, 2], condition: { id: 'partly-sunny', label: 'Partly sunny', emoji: '⛅' } },
  { codes: [3], condition: { id: 'overcast', label: 'Overcast', emoji: '☁️' } },
  { codes: [45, 48], condition: { id: 'foggy', label: 'Foggy', emoji: '☁️', hasMist: true } },
  { codes: [51, 53, 55, 56, 57], condition: { id: 'drizzle', label: 'Drizzle', emoji: '🌦️' } },
  { codes: [61, 63, 80, 81], condition: { id: 'rain', label: 'Rain', emoji: '🌧️' } },
  { codes: [65, 66, 67, 82], condition: { id: 'heavy-rain', label: 'Heavy rain', emoji: '🌧️' } },
  { codes: [71, 73, 75, 77, 85, 86], condition: { id: 'snow', label: 'Snow', emoji: '🌨️' } },
  { codes: [95, 96, 99], condition: { id: 'thunderstorms', label: 'Thunderstorms', emoji: '⛈️' } },
];

export function getWeatherCondition(code: number | null): WeatherCondition {
  const match = CONDITIONS.find((entry) => code !== null && entry.codes.includes(code));
  const result = match?.condition ?? UNKNOWN;
  return result;
}
