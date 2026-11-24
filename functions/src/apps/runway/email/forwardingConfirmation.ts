import { toAddress } from './emailShared.js';
import {
  isProtonInvitation,
  isProtonSender,
  readProtonLink,
} from './parseAlert.js';

const GMAIL_SENDER = 'forwarding-noreply@google.com';
const YAHOO_DOMAINS = ['yahoo.com', 'yahoo-inc.com', 'yahoomail.com'];
const GMAIL_HOSTS = ['mail.google.com', 'mail-settings.google.com'];
const CONFIRM_TIMEOUT_MS = 8_000;

export type ConfirmProvider = 'gmail' | 'yahoo' | 'proton';
export type AutoConfirm = 'confirmed' | 'failed' | 'skipped';

interface ConfirmationMail {
  from: string;
  subject: string;
  text: string;
  isDkimPassed: boolean;
}

const isYahooSender = (from: string) => {
  const domain = toAddress(from).split('@')[1] ?? '';
  return YAHOO_DOMAINS.some(
    (known) => domain === known || domain.endsWith(`.${known}`),
  );
};

const isGmailConfirmation = (mail: ConfirmationMail) =>
  toAddress(mail.from) === GMAIL_SENDER &&
  mail.isDkimPassed &&
  /forwarding confirmation/i.test(mail.subject);

const isYahooConfirmation = (mail: ConfirmationMail) =>
  isYahooSender(mail.from) &&
  mail.isDkimPassed &&
  /forward/i.test(mail.subject) &&
  /verif|confirm/i.test(mail.subject);

/** Which provider's forwarding confirmation this is, or null for any other email. Needs the sender's own DKIM pass, so a forwarded copy never counts. */
export function confirmProviderOf(
  mail: ConfirmationMail,
): ConfirmProvider | null {
  if (isGmailConfirmation(mail)) return 'gmail';
  if (isYahooConfirmation(mail)) return 'yahoo';
  return isProtonInvitation(mail) ? 'proton' : null;
}

export const isForwardingConfirmation = (mail: ConfirmationMail) =>
  confirmProviderOf(mail) !== null;

function readYahooLink(text: string) {
  const links = Array.from(
    text.matchAll(
      /(?:^|[\s"'<(])(https:\/\/((?:[a-z0-9-]+\.)*yahoo\.com)\/[^\s"'<>)\]]+)/gi,
    ),
  )
    .filter(([, , host]) => !/^(?:help|legal|policies)\./i.test(host))
    .map(([, link]) => link);
  const isVerifyPath = (link: string) =>
    /verif|confirm/i.test(
      link.replace(/^https:\/\/[^/]+/i, '').split(/[?#]/)[0],
    );
  return (
    links.find((link) => isVerifyPath(link) && link.includes('?')) ??
    links.find(isVerifyPath) ??
    links[0]
  );
}

export function readConfirmation(mail: ConfirmationMail) {
  const readGoogleLink = () =>
    /https:\/\/mail(?:-settings)?\.google\.com\/[^\s"'<>)\]]+/i.exec(
      mail.text,
    )?.[0];
  const url = isYahooSender(mail.from)
    ? readYahooLink(mail.text)
    : isProtonSender(mail.from)
      ? readProtonLink(mail.text)
      : readGoogleLink();
  const code = /code[^0-9]{0,60}(\d{6,9})\b/i.exec(mail.text)?.[1];
  return {
    confirmUrl: url?.replace(/[.,;]+$/, '').slice(0, 2000) ?? null,
    confirmCode: code ?? null,
  };
}

const isYahooHost = (host: string) =>
  host === 'yahoo.com' || host.endsWith('.yahoo.com');

/** A confirm link the server may open for this provider: https, no sign-in details or port, and exactly the provider's own host (Gmail's two, or Yahoo and its subdomains). */
export function isAcceptedConfirmUrl(
  url: string | null,
  provider: ConfirmProvider | null,
): boolean {
  if (url === null || (provider !== 'gmail' && provider !== 'yahoo')) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.port === '' &&
      (provider === 'gmail' ? GMAIL_HOSTS.includes(host) : isYahooHost(host))
    );
  } catch {
    return false;
  }
}

const isSignInPage = (finalUrl: string) => {
  try {
    const { hostname } = new URL(finalUrl);
    return hostname === 'accounts.google.com' || hostname === 'login.yahoo.com';
  } catch {
    return false;
  }
};

/** Opens the provider's confirm link once with a plain GET (no cookies, redirects followed, 8 s). Never throws; a sign-in page at the end of the redirects is a failure, not a confirmation. */
export async function followConfirmLink(
  url: string | null,
  provider: ConfirmProvider | null,
  doFetch: typeof fetch = fetch,
): Promise<{
  autoConfirm: AutoConfirm;
  status: number | null;
  errorName: string | null;
}> {
  if (url === null || !isAcceptedConfirmUrl(url, provider)) {
    return { autoConfirm: 'skipped', status: null, errorName: null };
  }
  try {
    const response = await doFetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      signal: AbortSignal.timeout(CONFIRM_TIMEOUT_MS),
    });
    return {
      autoConfirm:
        response.ok && !isSignInPage(response.url) ? 'confirmed' : 'failed',
      status: response.status,
      errorName: null,
    };
  } catch (error) {
    return {
      autoConfirm: 'failed',
      status: null,
      errorName: (error as Error)?.name ?? 'Error',
    };
  }
}
