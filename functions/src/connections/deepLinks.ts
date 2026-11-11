const MAIL_LINK =
  /^https:\/\/mail\.google\.com\/mail\/\?authuser=([^&#\s]+)#all\/([0-9A-Za-z_-]{1,64})$/;

/** The link that opens one message in Gmail, built from the account's email and the message id and never stored. */
export const toMailLink = (email: string, ref: string) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${ref}`;

const isMailLink = (link: string) => {
  const match = MAIL_LINK.exec(link);
  if (!match) return false;
  try {
    const email = decodeURIComponent(match[1]);
    return email.includes('@') && toMailLink(email, match[2]) === link;
  } catch {
    return false;
  }
};

const DOCUMENT_LINK =
  /^https:\/\/(?:docs\.google\.com\/document\/d\/([A-Za-z0-9_-]{10,128})\/edit|drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,128})\/view)\?authuser=([^&#\s]+)$/;

/** The link that opens one Google Doc, or any other file in Drive's viewer, built from the account's email and the file id and never stored. */
export const toDocumentLink = (
  email: string,
  ref: string,
  kind: 'doc' | 'pdf' | 'other',
) =>
  kind === 'doc'
    ? `https://docs.google.com/document/d/${ref}/edit?authuser=${encodeURIComponent(email)}`
    : `https://drive.google.com/file/d/${ref}/view?authuser=${encodeURIComponent(email)}`;

const isDocumentLink = (link: string) => {
  const match = DOCUMENT_LINK.exec(link);
  if (!match) return false;
  try {
    const email = decodeURIComponent(match[3]);
    const isDoc = match[1] !== undefined;
    return (
      email.includes('@') &&
      toDocumentLink(email, match[1] ?? match[2], isDoc ? 'doc' : 'pdf') ===
        link
    );
  } catch {
    return false;
  }
};

/** A site app's own route: its path and nothing else (no host, no other app's path). */
const isSiteLink = (connectorId: string, link: string) => {
  const appId = connectorId.startsWith('app:') ? connectorId.slice(4) : '';
  return appId !== '' && /^[a-z0-9-]+$/.test(appId) && link === `/${appId}`;
};

/** True only for a link this connector builds, whatever else the text parses as. */
export const isLiveDeepLink = (connectorId: string, link: string) =>
  isSiteLink(connectorId, link) ||
  (connectorId === 'google:gmail' && isMailLink(link)) ||
  (connectorId === 'google:drive' && isDocumentLink(link));
