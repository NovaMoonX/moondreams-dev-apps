export interface WeatherLocation {
  latitude: number;
  longitude: number;
}

export interface WeatherRequest extends WeatherLocation {
  /** IANA zone the forecast's times are expressed in; `null` lets the provider pick the location's own. */
  timezone: string | null;
  /** `YYYY-MM-DD`, inclusive. */
  startDate: string;
  endDate: string;
}

export interface DayForecast {
  /** `YYYY-MM-DD` in the request's zone. */
  date: string;
  weatherCode: number | null;
  tempMax: number | null;
  tempMin: number | null;
  /** 0-100; `null` for days the provider has no probability for (past days). */
  precipChance: number | null;
}

export interface HourForecast {
  /** Zone-local `YYYY-MM-DDTHH:00`. */
  time: string;
  weatherCode: number | null;
  temp: number | null;
  precipChance: number | null;
}

export interface WeatherForecast {
  /** The IANA zone the times are in — the request's own, or the one the provider resolved for `auto`. */
  timezone: string | null;
  days: DayForecast[];
  hours: HourForecast[];
}
