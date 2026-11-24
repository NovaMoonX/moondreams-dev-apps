import { Fragment } from 'react';

import { splitAddressForWrap } from '@/lib/emailForwarding/address';

interface EmailAddressTextProps {
  address: string;
  /** A forwarding address's local part before its token (`name` in `name-<token>@…`), so it may wrap after it; leave out for any other address. */
  prefix?: string;
}

// <wbr> is not text, so selecting the address copies it whole.
function EmailAddressText({ address, prefix }: EmailAddressTextProps) {
  return (
    <span className='[overflow-wrap:anywhere]'>
      {splitAddressForWrap(
        address,
        prefix === undefined ? '' : `${prefix}-`,
      ).map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

export default EmailAddressText;
