export function normalizeCustomLabelCasing(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
}
