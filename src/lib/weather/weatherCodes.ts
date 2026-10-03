import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from 'lucide-react';

export interface WeatherCondition {
  label: string;
  icon: LucideIcon;
}

const UNKNOWN: WeatherCondition = { label: 'Forecast', icon: Cloud };

/** Groups of WMO weather interpretation codes, as Open-Meteo reports them. */
const CONDITIONS: { codes: number[]; condition: WeatherCondition }[] = [
  { codes: [0], condition: { label: 'Clear skies', icon: Sun } },
  { codes: [1, 2], condition: { label: 'Partly sunny', icon: CloudSun } },
  { codes: [3], condition: { label: 'Overcast', icon: Cloud } },
  { codes: [45, 48], condition: { label: 'Foggy', icon: CloudFog } },
  { codes: [51, 53, 55, 56, 57], condition: { label: 'Drizzle', icon: CloudDrizzle } },
  { codes: [61, 63, 80, 81], condition: { label: 'Rain', icon: CloudRain } },
  { codes: [65, 66, 67, 82], condition: { label: 'Heavy rain', icon: CloudRain } },
  { codes: [71, 73, 75, 77, 85, 86], condition: { label: 'Snow', icon: CloudSnow } },
  { codes: [95, 96, 99], condition: { label: 'Thunderstorms', icon: CloudLightning } },
];

export function getWeatherCondition(code: number | null): WeatherCondition {
  const match = CONDITIONS.find((entry) => code !== null && entry.codes.includes(code));
  const result = match?.condition ?? UNKNOWN;
  return result;
}
