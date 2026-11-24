import { Fragment } from 'react';

import { EMAIL_ADDRESS_PREFIX } from '@apps/runway/constants';
import { splitAddressForWrap } from '@apps/runway/utils/emailSenders';

interface EmailAddressTextProps {
  address: string;
}

// <wbr> is not text, so selecting the address copies it whole.
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
