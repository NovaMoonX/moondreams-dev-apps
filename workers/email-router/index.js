import PostalMime from 'postal-mime';

const MAX_BYTES = 500 * 1024;
const MAX_FIELD = 200 * 1024;
const REJECTIONS = {
  403: 'Message not accepted',
  404: 'No such address',
  413: 'Message too large',
};

const readResult = (headers, name) => {
  const line = headers
    .filter((header) => header.key === 'authentication-results')
    .map((header) => header.value)
    .join(' ');
  return (
    new RegExp(`\\b${name}=([a-z]+)`, 'i').exec(line)?.[1]?.toLowerCase() ??
    'none'
  );
};

const readTarget = (to, env) => {
  const prefix = /^([a-z]+)\+/.exec(to.trim().toLowerCase())?.[1];
  return prefix === 'runway'
    ? env.INGEST_URL
    : prefix === 'amc'
      ? env.A_LIST_INGEST_URL
      : null;
};

export default {
  async email(message, env) {
    const target = readTarget(message.to, env);
    if (!target) {
      message.setReject('No such address');
      return;
    }
    if (message.rawSize > MAX_BYTES) {
      message.setReject('Message too large');
      return;
    }
    try {
      const mail = await PostalMime.parse(message.raw);
      const response = await fetch(target, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-runway-email-secret': env.INGEST_SECRET,
          'x-app-email-secret': env.INGEST_SECRET,
        },
        body: JSON.stringify({
          to: message.to,
          from: message.from,
          subject: mail.subject ?? '',
          text: (mail.text ?? '').slice(0, MAX_FIELD),
          html: mail.text?.trim() ? '' : (mail.html ?? '').slice(0, MAX_FIELD),
          messageId: mail.messageId ?? message.headers.get('message-id') ?? '',
          spf: readResult(mail.headers, 'spf'),
          dkim: readResult(mail.headers, 'dkim'),
          receivedAt: Date.now(),
        }),
      });
      const reason = REJECTIONS[response.status];
      if (reason) message.setReject(reason);
    } catch {
      // A server error or a message that cannot be read is dropped, never bounced.
    }
  },
};
