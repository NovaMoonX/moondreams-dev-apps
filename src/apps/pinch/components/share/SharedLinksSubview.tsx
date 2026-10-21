import { useMemo, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import DetailSheet from '@/components/DetailSheet';
import IntroCard from '@/components/IntroCard';
import SearchInput from '@/components/SearchInput';
import ShowMoreButton from '@/components/ShowMoreButton';
import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import ShareView from '@apps/pinch/components/share/ShareView';
import {
  LIST_SEARCH_THRESHOLD,
  MAX_PINCH_SHARES,
  SHARE_KIND_EMOJIS,
  SHARES_FIRST_PAGE,
} from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { selectShareStatuses, selectShares } from '@apps/pinch/store/selectors';
import type { ShareKind } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';

/** A row's "Show N more" hides at least this many, or it isn't drawn. */
const MIN_HIDDEN = 4;

interface OpenedShare {
  kind: ShareKind;
  sourceId: string;
  title: string;
}

function SharedLinksSubview() {
  const { subview, openSubview, closeSubview } = usePinchOverlay();
  const shares = useAppSelector(selectShares);
  const statuses = useAppSelector(selectShareStatuses);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(SHARES_FIRST_PAGE);
  const [opened, setOpened] = useState<OpenedShare | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [footerNode, setFooterNode] = useState<HTMLElement | null>(null);

  const matches = useMemo(
    () =>
      searchByName(
        shares.map((share) => ({ name: share.title, share })),
        query,
      ).map(({ share }) => share),
    [shares, query],
  );
  const shown =
    matches.length - limit < MIN_HIDDEN ? matches : matches.slice(0, limit);
  const hiddenCount = matches.length - shown.length;
  const isFull = shares.length >= MAX_PINCH_SHARES;

  const closeSheet = () => {
    setOpened(null);
    window.requestAnimationFrame(() => {
      if (openerRef.current?.isConnected) openerRef.current.focus();
    });
  };

  return (
    <Subview
      title='Shared links'
      onClose={() =>
        subview?.kind === 'shares' && subview.fromSheet
          ? closeSubview()
          : openSubview({ kind: 'settings' })
      }
    >
      <div className='space-y-4'>
        {shares.length > 0 && shares.length < LIST_SEARCH_THRESHOLD && (
          <IntroCard icon='🔗' lead='The links you have shared.'>
            Tap one to copy it, update it or stop sharing.
          </IntroCard>
        )}
        {shares.length >= LIST_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder='Search your shared links'
          />
        )}
        {isFull && (
          <p className='text-muted-foreground text-sm text-pretty'>
            You have {MAX_PINCH_SHARES} links, the most you can have at once.
            Stop one to share something else.
          </p>
        )}
        {shares.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm text-pretty'>
            Nothing is shared right now. You can share a recipe or a saved meal
            from its More menu.
          </p>
        ) : shown.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <ul className='border-border divide-border divide-y rounded-2xl border px-3'>
            {shown.map((share) => {
              const status = statuses.get(share.id);
              const getFlag = () => {
                if (status?.isGone) return 'Original deleted';
                return status?.isStale ? 'Changed since' : null;
              };
              const flag = getFlag();
              const verb =
                share.updatedAt > share.createdAt ? 'Updated' : 'Shared';

              return (
                <li key={share.id}>
                  <Button
                    type='button'
                    variant='tertiary'
                    aria-haspopup='dialog'
                    onClick={(event) => {
                      openerRef.current = event.currentTarget;
                      setOpened({
                        kind: share.kind,
                        sourceId: share.sourceId,
                        title: share.title,
                      });
                    }}
                    className='h-auto min-h-14 w-full items-start justify-start gap-3 px-0! py-2 text-left'
                  >
                    <span
                      className='flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--pinch-drizzle-soft)]'
                      aria-hidden='true'
                    >
                      {SHARE_KIND_EMOJIS[share.kind]}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='text-foreground block font-medium wrap-break-word'>
                        {share.title}
                      </span>
                      <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-normal'>
                        <span className='whitespace-nowrap'>
                          {verb} {formatDateShort(share.updatedAt)}
                        </span>
                        {flag !== null && (
                          <span className='bg-accent text-accent-foreground rounded-full px-2 py-0.5 whitespace-nowrap'>
                            {flag}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      className='text-muted-foreground mt-2.5 h-5 w-5 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {hiddenCount > 0 && (
          <ShowMoreButton onClick={() => setLimit(limit + SHARES_FIRST_PAGE)}>
            Show {hiddenCount} more
          </ShowMoreButton>
        )}
      </div>
      {opened !== null && (
        <DetailSheet
          isOpen
          onClose={closeSheet}
          title={opened.title}
          footer={
            <div ref={setFooterNode} className='px-4 pb-4 empty:hidden' />
          }
        >
          <ShareView
            kind={opened.kind}
            sourceId={opened.sourceId}
            canStart={false}
            onStopped={closeSheet}
            footerNode={footerNode}
          />
        </DetailSheet>
      )}
    </Subview>
  );
}

export default SharedLinksSubview;
