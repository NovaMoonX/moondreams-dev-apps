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
  const hasInvalidDatePart = [year, month, day].some((part) =>
    Number.isNaN(part),
  );

  if (hasInvalidDatePart) {
    return undefined;
  }

  const result = Date.UTC(year, month - 1, day);
  return result;
}

/** Local-timezone counterpart to `toDateInputValue`, for pairing with `toLocalTimeInputValue` when a timestamp's time-of-day (not just its date) matters. */
export function toLocalDateInputValue(timestamp?: number | null) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalTimeInputValue(timestamp?: number | null) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalDateAndTimeInputValues(
  dateValue: string,
  timeValue: string,
) {
  if (!dateValue) {
    return undefined;
  }

  const timestamp = new Date(`${dateValue}T${timeValue || '00:00'}`).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

/** Whether two timestamps fall on the same calendar day (UTC) — for duplicate-matching fields whose time-of-day isn't meaningful. */
export function isSameCalendarDay(left: number, right: number) {
  return toDateInputValue(left) === toDateInputValue(right);
}
