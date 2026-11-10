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

/** True only for a link this connector builds, whatever else the text parses as. */
export const isLiveDeepLink = (connectorId: string, link: string) =>
  connectorId === 'google:gmail' && isMailLink(link);
