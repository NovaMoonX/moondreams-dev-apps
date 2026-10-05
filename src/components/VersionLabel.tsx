import { useQuery } from '@tanstack/react-query';

import { SITE_VERSION } from '@lib/app';
import { latestVersionQueryOptions } from '@lib/app/appVersionQueries';

export function VersionLabel() {
  const { data: latest } = useQuery(latestVersionQueryOptions());
  const isLatest = latest === SITE_VERSION;

  return (
    <>
      Version {SITE_VERSION}
      {isLatest && ' (latest)'}
    </>
  );
}
