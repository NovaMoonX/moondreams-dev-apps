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

export default {
  async email(message, env) {
    if (message.rawSize > MAX_BYTES) {
      message.setReject('Message too large');
      return;
    }
    try {
      const mail = await PostalMime.parse(message.raw);
      const response = await fetch(env.INGEST_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-runway-email-secret': env.INGEST_SECRET,
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
