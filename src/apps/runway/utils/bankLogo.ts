import { brandLogoUrl } from '@/utils/brandLogoUtils';
import type { OpenLink } from '@apps/runway/types';

type LogoSource = Pick<OpenLink, 'institutionLogo' | 'institutionDomain'>;

/** The bank's own logo, else one found by its website while the bank sends none; null when neither is there. */
export const getBankLogoSrc = (link: LogoSource) =>
  link.institutionLogo ??
  (link.institutionDomain === null
    ? null
    : brandLogoUrl(link.institutionDomain));

/** Whether this link's logo is the stand-in found by website, which needs the logo service's credit. */
export const isStandInLogo = (link: LogoSource) =>
  link.institutionLogo === null && getBankLogoSrc(link) !== null;
