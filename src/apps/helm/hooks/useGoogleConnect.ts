import { createContext, useContext } from 'react';

export interface GoogleConnectOptions {
  /** Reconnecting a known account: its id, so Google preselects it. */
  accountId?: string | null;
  /** Adding another account: Google asks which one. */
  isAnotherAccount?: boolean;
  /** What is being connected; Calendar when left out. */
  connectorId?:
    'google:calendar' | 'google:gmail' | 'google:drive' | 'google:contacts';
}

export interface GoogleConnectValue {
  /** Opens the sheet that says what will happen before the person leaves for Google. */
  begin: (options?: GoogleConnectOptions) => void;
  /** Opens the calendar picker on a connected account's grant, to change which calendars count. */
  openCalendarPicker: (accountId: string) => void;
  /** Asks Google for more permissions on a connected account, in a popup or by leaving the page: 'redirected' means the page is going to Google and the person must repeat what they were doing on their return. */
  requestCalendarScopes: (
    accountId: string,
    scopes: string[],
  ) => Promise<'granted' | 'cancelled' | 'redirected'>;
  /** Opens the contacts picker on an account that already shares contacts, or connects one first. */
  openContacts: () => void;
}

export const GoogleConnectContext = createContext<GoogleConnectValue | null>(
  null,
);

/** The one way into connecting a Google account, from Today and from Connected apps. */
export function useGoogleConnect() {
  const value = useContext(GoogleConnectContext);
  if (!value)
    throw new Error('useGoogleConnect needs the Google connection provider');
  return value;
}
