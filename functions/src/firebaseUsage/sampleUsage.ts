import type { UsageMetricSpec } from './pricing.js';

// How far along each limit the sample is: a share of the free amount (per day, or held) or, for monthly limits, a multiple of an even pace.
const SAMPLE_SHARE: Record<string, number> = {
  'firestore-reads': 1.4,
  'firestore-writes': 0.4,
  'firestore-deletes': 0.02,
  'rtdb-download': 0.4,
  'rtdb-storage': 0.02,
  'storage-stored': 0.18,
  'storage-download': 0.1,
  'functions-calls': 1.25,
};

/** Made-up readings in the shape `readMetric` returns, for emulators that can't reach Cloud Monitoring. Emulators only. */
export function readSampleMetric(spec: UsageMetricSpec, daysElapsed: number, daysInMonth: number) {
  const share = SAMPLE_SHARE[spec.id] ?? 0.1;
  const dayCount = Math.ceil(daysElapsed);

  if (spec.period === 'stock') return [spec.freeAmount * share];
  if (spec.period === 'day') return Array.from({ length: dayCount }, () => spec.freeAmount * share);

  const total = spec.freeAmount * (daysElapsed / daysInMonth) * share;
  const result = Array.from({ length: dayCount }, () => total / dayCount);
  return result;
}
