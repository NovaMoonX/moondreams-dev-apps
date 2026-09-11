export function formatList(names: string[]) {
  if (names.length === 0) {
    return '';
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();

  const options: Intl.DateTimeFormatOptions = {
    ...(isCurrentYear ? {} : { year: 'numeric' }),
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };

  return date.toLocaleString(undefined, options);
}

export function formatDateInputValue(timestamp?: number) {
  if (!timestamp || Number.isNaN(timestamp)) {
    return '';
  }

  const result = new Date(timestamp).toISOString().slice(0, 10);
  return result;
}

export function parseDateInputValue(value: string) {
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