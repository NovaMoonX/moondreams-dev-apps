import { Fragment } from 'react';

import { EMAIL_ADDRESS_PREFIX } from '@apps/runway/constants';
import { splitAddressForWrap } from '@apps/runway/utils/emailSenders';

interface EmailAddressTextProps {
  address: string;
}

/** An address that wraps only where `splitAddressForWrap` allows; the break points are not text, so selecting it copies the address whole. */
function EmailAddressText({ address }: EmailAddressTextProps) {
  return (
    <span className='[overflow-wrap:anywhere]'>
      {splitAddressForWrap(address, `${EMAIL_ADDRESS_PREFIX}-`).map(
        (part, index) => (
          <Fragment key={index}>
            {index > 0 && <wbr />}
            {part}
          </Fragment>
        ),
      )}
    </span>
  );
}

export default EmailAddressText;
