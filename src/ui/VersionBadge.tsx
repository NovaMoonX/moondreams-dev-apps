import { useEffect } from 'react';

import { SITE_VERSION } from '@lib/app';

function VersionBadge() {
  useEffect(() => {
    console.log(`MoonDreams Dev Apps v${SITE_VERSION}`);
  }, []);

  return (
    <div className='pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-end px-3 py-2 md:px-4'>
      <span className='text-muted-foreground pointer-events-auto select-none text-xs'>
        v{SITE_VERSION}
      </span>
    </div>
  );
}

export default VersionBadge;
