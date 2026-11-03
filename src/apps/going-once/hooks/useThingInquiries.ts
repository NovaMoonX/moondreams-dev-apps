import { useEffect, useState } from 'react';

import { startThingInquiriesListener } from '@apps/going-once/store/listeners/inquiriesListener';
import type { Inquiry } from '@apps/going-once/types';

interface Loaded {
  key: string;
  inquiries: Inquiry[] | null;
  hasFailed: boolean;
}

/** Every inquiry about one thing, in the order they were first sent. Mounted only while the thing's drawer is open; `null` until the first answer. */
export function useThingInquiries(saleId: string, itemId: string) {
  const key = `${saleId}/${itemId}`;
  const [loaded, setLoaded] = useState<Loaded>({
    key,
    inquiries: null,
    hasFailed: false,
  });

  useEffect(
    () =>
      startThingInquiriesListener(
        saleId,
        itemId,
        (inquiries) =>
          setLoaded({
            key,
            hasFailed: false,
            inquiries: [...inquiries].sort(
              (first, second) => first.createdAt - second.createdAt,
            ),
          }),
        () =>
          setLoaded((current) => ({
            key,
            inquiries: current.key === key ? current.inquiries : null,
            hasFailed: true,
          })),
      ),
    [saleId, itemId, key],
  );

  const isCurrent = loaded.key === key;
  return {
    inquiries: isCurrent ? loaded.inquiries : null,
    hasFailed: isCurrent && loaded.hasFailed,
  };
}
