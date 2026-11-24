import type { ReactNode } from 'react';

import FallbackImage from '@/components/FallbackImage';
import type { OpenLink } from '@apps/runway/types';
import { getBankLogoSrc } from '@apps/runway/utils/bankLogo';

interface BankLogoProps {
  link: Pick<OpenLink, 'institutionLogo' | 'institutionDomain'>;
  className: string;
  fallback: ReactNode;
}

/** A linked bank's logo on a white tile, or `fallback` when there is none or it fails to load. */
function BankLogo({ link, className, fallback }: BankLogoProps) {
  const src = getBankLogoSrc(link);
  if (src === null) return fallback;
  return (
    <FallbackImage
      src={src}
      alt=''
      aria-hidden='true'
      className={className}
      fallback={fallback}
    />
  );
}

export default BankLogo;
