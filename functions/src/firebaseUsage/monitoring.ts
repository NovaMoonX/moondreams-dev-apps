import { GoogleAuth } from 'google-auth-library';

import type { UsageMetricSpec } from './pricing.js';

const DAY_MS = 86_400_000;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/monitoring.read'] });

export class MonitoringAccessError extends Error {}

interface TimeSeriesResponse {
  timeSeries?: { points?: { interval: { endTime: string }; value: { int64Value?: string; doubleValue?: number } }[] }[];
}

/** UTC midnight at the start of the month containing `now`. */
export function getMonthStart(now: number) {
  const date = new Date(now);
  const result = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return result;
}

/**
 * One summed value per UTC day since the start of the month (oldest first), for a counter metric;
 * for a gauge (`stock`) the latest reading as the only entry. Days without data read as 0.
 */
export async function readMetric(projectId: string, spec: UsageMetricSpec, now: number) {
  const monthStart = getMonthStart(now);
  const isStock = spec.period === 'stock';
  const start = isStock ? now - 3 * DAY_MS : monthStart;
  const params = new URLSearchParams({
    filter: `metric.type="${spec.metricType}"`,
    'interval.startTime': new Date(start).toISOString(),
    'interval.endTime': new Date(now).toISOString(),
    'aggregation.alignmentPeriod': isStock ? '3600s' : `${DAY_MS / 1000}s`,
    'aggregation.perSeriesAligner': isStock ? 'ALIGN_MAX' : 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });

  const client = await auth.getClient();
  const response = await client
    .request<TimeSeriesResponse>({
      url: `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params.toString()}`,
    })
    .catch((error: { response?: { status?: number } }) => {
      if (error.response?.status === 403) throw new MonitoringAccessError();
      throw error;
    });

  const points = (response.data.timeSeries ?? []).flatMap((series) => series.points ?? []);
  const toNumber = (point: (typeof points)[number]) => Number(point.value.int64Value ?? point.value.doubleValue ?? 0);

  if (isStock) {
    const latest = [...points].sort((a, b) => a.interval.endTime.localeCompare(b.interval.endTime)).at(-1);
    const result = [latest ? toNumber(latest) : 0];
    return result;
  }

  // Alignment buckets end at `now` minus whole days, so they're keyed back to the UTC day they cover.
  const dayCount = Math.floor((now - monthStart) / DAY_MS) + 1;
  const byDay = points.reduce<number[]>((days, point) => {
    const end = Date.parse(point.interval.endTime);
    const index = Math.min(dayCount - 1, Math.max(0, Math.floor((end - 1 - monthStart) / DAY_MS)));
    days[index] += toNumber(point);
    return days;
  }, Array.from({ length: dayCount }, () => 0));
  return byDay;
}
