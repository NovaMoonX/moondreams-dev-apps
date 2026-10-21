import type { DayForecast } from '@/lib/weather/types';
import { getWeatherCondition, type WeatherConditionId } from '@/lib/weather/weatherCodes';

export interface PackingSuggestion {
  id: string;
  emoji: string;
  title: string;
  /** What the forecast says, in a sentence: "Rain on Oct 22 and Oct 23." */
  reason: string;
  items: string[];
}

export interface PackingDay {
  dayIndex: number;
  forecast: DayForecast;
}

// Forecasts are in °F.
const COLD_LOW = 40;
const CHILLY_LOW = 55;
const HOT_HIGH = 85;
const SUNNY_HIGH = 70;
const BIG_SWING = 25;
const LIKELY_RAIN_CHANCE = 50;

const WET: WeatherConditionId[] = ['drizzle', 'rain', 'heavy-rain', 'thunderstorms'];
const SOAKING: WeatherConditionId[] = ['heavy-rain', 'thunderstorms'];

const isWet = ({ forecast }: PackingDay) =>
  WET.includes(getWeatherCondition(forecast.weatherCode).id) || (forecast.precipChance ?? 0) >= LIKELY_RAIN_CHANCE;
const isSoaking = ({ forecast }: PackingDay) => SOAKING.includes(getWeatherCondition(forecast.weatherCode).id);
const isSnowy = ({ forecast }: PackingDay) => getWeatherCondition(forecast.weatherCode).id === 'snow';
const isSunny = ({ forecast }: PackingDay) =>
  ['clear', 'partly-sunny'].includes(getWeatherCondition(forecast.weatherCode).id) &&
  (forecast.tempMax ?? 0) >= SUNNY_HIGH;
const isCold = ({ forecast }: PackingDay) => forecast.tempMin !== null && forecast.tempMin <= COLD_LOW;
const isChilly = ({ forecast }: PackingDay) =>
  forecast.tempMin !== null && forecast.tempMin > COLD_LOW && forecast.tempMin <= CHILLY_LOW;
const isHot = ({ forecast }: PackingDay) => forecast.tempMax !== null && forecast.tempMax >= HOT_HIGH;
const isSwingy = ({ forecast }: PackingDay) =>
  forecast.tempMax !== null && forecast.tempMin !== null && forecast.tempMax - forecast.tempMin >= BIG_SWING;

const joinDays = (labels: string[]) => {
  const shown = labels.slice(0, 2);
  const extra = labels.length - shown.length;
  return extra > 0 ? `${shown.join(', ')} and ${extra} more` : shown.join(' and ');
};

/** What to wear and bring for the days still ahead, from their forecasts. A suggestion appears only when
 * some day calls for it, and an item named by an earlier suggestion isn't repeated in a later one. */
export function getPackingSuggestions(days: PackingDay[], getDayLabel: (dayIndex: number) => string) {
  const labelsFor = (matches: (day: PackingDay) => boolean) => days.filter(matches).map(({ dayIndex }) => getDayLabel(dayIndex));
  const lowest = Math.min(...days.map(({ forecast }) => forecast.tempMin ?? Infinity));
  const highest = Math.max(...days.map(({ forecast }) => forecast.tempMax ?? -Infinity));

  const rules: { suggestion: Omit<PackingSuggestion, 'reason'>; labels: string[]; reason: (days: string) => string }[] = [
    {
      suggestion: {
        id: 'rain',
        emoji: '🌧️',
        title: 'Rain',
        items: ['Umbrella', 'Rain jacket', ...(days.some(isSoaking) ? ['Waterproof shoes'] : [])],
      },
      labels: labelsFor(isWet),
      reason: (list) => `Rain is in the forecast for ${list}.`,
    },
    {
      suggestion: { id: 'snow', emoji: '🌨️', title: 'Snow', items: ['Warm coat', 'Waterproof boots', 'Gloves', 'Warm hat'] },
      labels: labelsFor(isSnowy),
      reason: (list) => `Snow is possible on ${list}.`,
    },
    {
      suggestion: { id: 'cold', emoji: '🧥', title: 'Cold', items: ['Warm coat', 'Gloves', 'Warm hat', 'Warm socks'] },
      labels: labelsFor(isCold),
      reason: (list) => `Lows down to ${Math.round(lowest)}°F on ${list}.`,
    },
    {
      suggestion: { id: 'chilly', emoji: '🧣', title: 'Chilly', items: ['Light jacket', 'Sweater or hoodie'] },
      labels: labelsFor(isChilly),
      reason: (list) => `Mornings and evenings cool down on ${list}.`,
    },
    {
      suggestion: {
        id: 'hot',
        emoji: '🥵',
        title: 'Hot',
        items: ['Sunscreen', 'Sun hat', 'Reusable water bottle', 'Light, breathable clothes'],
      },
      labels: labelsFor(isHot),
      reason: (list) => `Highs up to ${Math.round(highest)}°F on ${list}.`,
    },
    {
      suggestion: { id: 'sun', emoji: '😎', title: 'Sunny', items: ['Sunglasses', 'Sunscreen'] },
      labels: labelsFor(isSunny),
      reason: (list) => `Sunshine on ${list}.`,
    },
    {
      suggestion: { id: 'swing', emoji: '🌡️', title: 'Big swings', items: ['Layers you can add or shed'] },
      labels: labelsFor(isSwingy),
      reason: (list) => `The temperature swings 25° or more in a day, on ${list}.`,
    },
  ];

  const result = rules
    .filter(({ labels }) => labels.length > 0)
    .reduce<{ seen: Set<string>; suggestions: PackingSuggestion[] }>(
      ({ seen, suggestions }, { suggestion, labels, reason }) => {
        const items = suggestion.items.filter((item) => !seen.has(item.toLowerCase()));
        return {
          seen: new Set([...seen, ...items.map((item) => item.toLowerCase())]),
          suggestions: items.length > 0 ? [...suggestions, { ...suggestion, items, reason: reason(joinDays(labels)) }] : suggestions,
        };
      },
      { seen: new Set(), suggestions: [] },
    ).suggestions;
  return result;
}
