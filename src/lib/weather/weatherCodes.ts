export interface WeatherCondition {
  label: string;
  emoji: string;
  /** The fog emoji reads as a smudged square, so fog is a cloud with mist lines drawn under it. */
  hasMist?: boolean;
}

const UNKNOWN: WeatherCondition = { label: 'Forecast', emoji: '🌡️' };

const CONDITIONS: { codes: number[]; condition: WeatherCondition }[] = [
  { codes: [0], condition: { label: 'Clear skies', emoji: '☀️' } },
  { codes: [1, 2], condition: { label: 'Partly sunny', emoji: '⛅' } },
  { codes: [3], condition: { label: 'Overcast', emoji: '☁️' } },
  { codes: [45, 48], condition: { label: 'Foggy', emoji: '☁️', hasMist: true } },
  { codes: [51, 53, 55, 56, 57], condition: { label: 'Drizzle', emoji: '🌦️' } },
  { codes: [61, 63, 80, 81], condition: { label: 'Rain', emoji: '🌧️' } },
  { codes: [65, 66, 67, 82], condition: { label: 'Heavy rain', emoji: '🌧️' } },
  { codes: [71, 73, 75, 77, 85, 86], condition: { label: 'Snow', emoji: '🌨️' } },
  { codes: [95, 96, 99], condition: { label: 'Thunderstorms', emoji: '⛈️' } },
];

export function getWeatherCondition(code: number | null): WeatherCondition {
  const match = CONDITIONS.find((entry) => code !== null && entry.codes.includes(code));
  const result = match?.condition ?? UNKNOWN;
  return result;
}
