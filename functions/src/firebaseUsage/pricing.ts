export type UsageProduct = 'Firestore' | 'Realtime Database' | 'Cloud Storage' | 'Functions';

/** `day`: the free amount resets daily. `month`: it resets monthly. `stock`: an amount held, billed per month. */
export type UsagePeriod = 'day' | 'month' | 'stock';

export interface UsageMetricSpec {
  id: string;
  product: UsageProduct;
  label: string;
  metricType: string;
  unit: 'count' | 'bytes';
  period: UsagePeriod;
  /** Free amount per `period`, in `unit`. */
  freeAmount: number;
  /** Blaze price in USD per one `unit` over the free amount. */
  pricePerUnit: number;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** Free amounts are from firebase.google.com/pricing. Firestore, Cloud Storage and Functions-compute prices there say only "Google Cloud pricing"; the figures here are for multi-region Firestore (nam5) and still need checking against it. */
export const PRICING_LAST_CHECKED = '2026-10-21';

export const USAGE_METRICS: UsageMetricSpec[] = [
  {
    id: 'firestore-reads',
    product: 'Firestore',
    label: 'Document reads',
    metricType: 'firestore.googleapis.com/document/read_count',
    unit: 'count',
    period: 'day',
    freeAmount: 50_000,
    pricePerUnit: 0.06 / 100_000,
  },
  {
    id: 'firestore-writes',
    product: 'Firestore',
    label: 'Document writes',
    metricType: 'firestore.googleapis.com/document/write_count',
    unit: 'count',
    period: 'day',
    freeAmount: 20_000,
    pricePerUnit: 0.18 / 100_000,
  },
  {
    id: 'firestore-deletes',
    product: 'Firestore',
    label: 'Document deletes',
    metricType: 'firestore.googleapis.com/document/delete_count',
    unit: 'count',
    period: 'day',
    freeAmount: 20_000,
    pricePerUnit: 0.02 / 100_000,
  },
  {
    id: 'rtdb-download',
    product: 'Realtime Database',
    label: 'Data downloaded',
    metricType: 'firebasedatabase.googleapis.com/network/sent_bytes_count',
    unit: 'bytes',
    period: 'day',
    freeAmount: 360 * MB,
    pricePerUnit: 1 / GB,
  },
  {
    id: 'rtdb-storage',
    product: 'Realtime Database',
    label: 'Data stored',
    metricType: 'firebasedatabase.googleapis.com/storage/total_bytes',
    unit: 'bytes',
    period: 'stock',
    freeAmount: 1 * GB,
    pricePerUnit: 5 / GB,
  },
  {
    id: 'storage-stored',
    product: 'Cloud Storage',
    label: 'Files stored',
    metricType: 'storage.googleapis.com/storage/total_bytes',
    unit: 'bytes',
    period: 'stock',
    freeAmount: 5 * GB,
    pricePerUnit: 0.026 / GB,
  },
  {
    id: 'functions-calls',
    product: 'Functions',
    label: 'Function calls',
    metricType: 'run.googleapis.com/request_count',
    unit: 'count',
    period: 'month',
    freeAmount: 2_000_000,
    pricePerUnit: 0.4 / 1_000_000,
  },
];

/** Download limits differ by bucket: legacy `.appspot.com` buckets get 1 GB a day, newer `.firebasestorage.app` ones 100 GB a month (in us-central1, us-west1 and us-east1 only). */
export function getStorageDownloadSpec(bucketName: string): UsageMetricSpec {
  const base = {
    id: 'storage-download',
    product: 'Cloud Storage' as const,
    label: 'Files downloaded',
    metricType: 'storage.googleapis.com/network/sent_bytes_count',
    unit: 'bytes' as const,
    pricePerUnit: 0.12 / GB,
  };
  if (bucketName.endsWith('.appspot.com')) return { ...base, period: 'day', freeAmount: 1 * GB };
  return { ...base, period: 'month', freeAmount: 100 * GB };
}

/** Every limit the page tracks, with the storage download limit chosen for this project's bucket. */
export function getUsageMetrics(bucketName: string) {
  const result = USAGE_METRICS.flatMap((spec) =>
    spec.id === 'storage-stored' ? [spec, getStorageDownloadSpec(bucketName)] : [spec],
  );
  return result;
}

export interface UsageLine {
  id: string;
  product: UsageProduct;
  label: string;
  unit: 'count' | 'bytes';
  period: UsagePeriod;
  /** What was used: this month so far for `month`, the latest day for `day`, the amount held for `stock`. */
  used: number;
  freeAmount: number;
  isOver: boolean;
  /** Days this month that went over a daily free amount; null for the other periods. */
  daysOver: number | null;
  /** Estimated Blaze charge for the month so far, in USD. */
  monthToDateCostUsd: number;
  /** Estimated charge for the whole month at the current pace, in USD. */
  projectedCostUsd: number;
}

interface PriceInput {
  spec: UsageMetricSpec;
  /** One value per UTC day this month so far (oldest first), or for `stock` the held amount as the only entry. */
  daily: number[];
  daysElapsed: number;
  daysInMonth: number;
}

const over = (value: number, free: number) => Math.max(0, value - free);

/** Turns a metric's readings into how much of the free amount is used and what the overage would cost. */
export function priceMetric({ spec, daily, daysElapsed, daysInMonth }: PriceInput): UsageLine {
  const base = {
    id: spec.id,
    product: spec.product,
    label: spec.label,
    unit: spec.unit,
    period: spec.period,
    freeAmount: spec.freeAmount,
  };

  if (spec.period === 'stock') {
    const held = daily.at(-1) ?? 0;
    const cost = over(held, spec.freeAmount) * spec.pricePerUnit;
    return { ...base, used: held, isOver: held > spec.freeAmount, daysOver: null, monthToDateCostUsd: cost, projectedCostUsd: cost };
  }

  if (spec.period === 'day') {
    const monthToDateCost = daily.reduce((sum, day) => sum + over(day, spec.freeAmount) * spec.pricePerUnit, 0);
    const daysOver = daily.filter((day) => day > spec.freeAmount).length;
    const latest = daily.at(-1) ?? 0;
    const projected = daysElapsed > 0 ? (monthToDateCost / daysElapsed) * daysInMonth : 0;
    return { ...base, used: latest, isOver: daysOver > 0, daysOver, monthToDateCostUsd: monthToDateCost, projectedCostUsd: projected };
  }

  const total = daily.reduce((sum, day) => sum + day, 0);
  const projectedTotal = daysElapsed > 0 ? (total / daysElapsed) * daysInMonth : 0;
  return {
    ...base,
    used: total,
    isOver: total > spec.freeAmount,
    daysOver: null,
    monthToDateCostUsd: over(total, spec.freeAmount) * spec.pricePerUnit,
    projectedCostUsd: over(projectedTotal, spec.freeAmount) * spec.pricePerUnit,
  };
}
