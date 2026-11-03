import { useEffect, useRef, useState } from 'react';

import { Check, Link2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import { copyToClipboard } from '@/utils/clipboardUtils';
import type { Item } from '@apps/going-once/types';
import { getThingPagePath } from '@apps/going-once/utils/listing';

const COPIED_MS = 2000;

interface CopyThingLinkRowProps {
  item: Item;
  linkId: string;
}

/** Copies the address of this thing on the public page, for sending one buyer straight to it. */
function CopyThingLinkRow({ item, linkId }: CopyThingLinkRowProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    const didCopy = await copyToClipboard(
      `${window.location.origin}${getThingPagePath(linkId, item.id)}`,
    );
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (!didCopy) {
      setState('failed');
      return;
    }
    setState('copied');
    timer.current = window.setTimeout(() => setState('idle'), COPIED_MS);
  };

  return (
    <ActionRow
      isGrouped
      isRoomy
      icon={state === 'copied' ? <Check /> : <Link2 />}
      label={state === 'copied' ? 'Copied' : 'Copy link to it'}
      subtitle={
        state === 'failed'
          ? "Your browser wouldn't copy it."
          : 'Opens this thing on your public page'
      }
      onClick={() => void copy()}
    />
  );
}

export default CopyThingLinkRow;
