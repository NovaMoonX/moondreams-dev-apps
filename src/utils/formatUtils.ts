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