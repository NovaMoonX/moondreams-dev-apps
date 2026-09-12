export function toDateInputValue(timestamp?: number) {
  if (!timestamp || Number.isNaN(timestamp)) {
    return '';
  }

  const result = new Date(timestamp).toISOString().slice(0, 10);
  return result;
}

export function fromDateInputValue(value: string) {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  const hasInvalidDatePart = [year, month, day].some((part) => Number.isNaN(part));

  if (hasInvalidDatePart) {
    return undefined;
  }

  const result = Date.UTC(year, month - 1, day);
  return result;
}
