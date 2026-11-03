import { useEffect, useRef, useState } from 'react';

import { Check, Copy } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { markListingCopied } from '@apps/going-once/store/actions/itemActions';
import type { Item } from '@apps/going-once/types';
import { listingText } from '@apps/going-once/utils/listing';

const COPIED_MS = 2000;

interface CopyListingTextRowProps {
  item: Item;
  uid: string;
}

/** Copies what buyers already see (never the private part) and remembers who did, so Mark sold can say to take that listing down. */
function CopyListingTextRow({ item, uid }: CopyListingTextRowProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    const didCopy = await copyToClipboard(listingText(item));
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (!didCopy) {
      setState('failed');
      return;
    }
    setState('copied');
    timer.current = window.setTimeout(() => setState('idle'), COPIED_MS);
    markListingCopied(item.saleId, item.id, uid).catch(() => undefined);
  };

  return (
    <ActionRow
      isGrouped
      isRoomy
      icon={state === 'copied' ? <Check /> : <Copy />}
      label={state === 'copied' ? 'Copied' : 'Copy listing text'}
      subtitle={
        state === 'failed'
          ? "Your browser wouldn't copy it."
          : 'Name, price, condition, description'
      }
      onClick={() => void copy()}
    />
  );
}

export default CopyListingTextRow;
