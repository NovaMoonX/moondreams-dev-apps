const EVENT_LINK = 'https://www.google.com/calendar/event?eid=';

/** The link that opens one event in Google Calendar, built from its ids and never stored. */
export const toEventLink = (calendarId: string, eventId: string) =>
  EVENT_LINK + Buffer.from(`${eventId} ${calendarId}`).toString('base64url');

/** True only for a Google Calendar address, whatever else the text parses as. */
export const isGoogleCalendarLink = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return (
      parsed.hostname === 'calendar.google.com' ||
      (parsed.hostname === 'www.google.com' &&
        parsed.pathname.startsWith('/calendar/'))
    );
  } catch {
    return false;
  }
};
