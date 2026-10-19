import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button, CopyButton } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Link2, Link2Off, RefreshCw, Share2 } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import IntroCard from '@/components/IntroCard';
import { useAppDispatch, useAppSelector } from '@/store';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDate } from '@/utils/formatUtils';
import { MAX_PINCH_SHARES } from '@apps/pinch/constants';
import {
  renewShareLink,
  saveShare,
  stopSharing,
} from '@apps/pinch/store/actions/shareActions';
import {
  selectIngredientsById,
  selectIsSharesReady,
  selectMealsById,
  selectRecipesById,
  selectShareBySource,
  selectShareStatuses,
  selectSharesLoadError,
} from '@apps/pinch/store/selectors';
import type { PinchShare, ShareKind } from '@apps/pinch/types';
import {
  buildSharePayload,
  getShareRecipes,
  getShareSource,
  getShareUrl,
} from '@apps/pinch/utils/sharing';

type BusyAction = 'create' | 'update' | 'renew' | 'stop';
type Notice = 'updated' | 'renewed' | 'stopped';

const COPY: Record<
  ShareKind,
  { thing: string; inCopy: string; changed: string }
> = {
  RECIPE: {
    thing: 'recipe',
    inCopy:
      'The title, a photo you uploaded, ingredients, steps, times, how to keep it and links.',
    changed: "You've changed this recipe since you shared it.",
  },
  MEAL: {
    thing: 'saved meal',
    inCopy:
      'The name, each recipe in it (with its photo you uploaded, ingredients, steps, times, how to keep it and links) and any plain ingredients.',
    changed:
      "You've changed this saved meal, or a recipe in it, since you shared it.",
  },
};

const getNoticeText = (notice: Notice, thing: string) => {
  if (notice === 'updated') {
    return `Updated. The link now shows this ${thing} as it is today.`;
  }
  if (notice === 'renewed') {
    return "Here's your new link. The old one has stopped working.";
  }
  return 'Sharing stopped. The link no longer works.';
};

interface ShareViewProps {
  kind: ShareKind;
  sourceId: string;
  /** False where the link's own list is shown: a link that is gone is then only said to be gone, never offered again. */
  canStart?: boolean;
  onStopped?: () => void;
  /** Where the primary action sits so it stays on screen: the sheet's pinned footer, which the sheet's owner draws and hands back. */
  footerNode: HTMLElement | null;
}

function ShareView({
  kind,
  sourceId,
  canStart = true,
  onStopped,
  footerNode,
}: ShareViewProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const share = useAppSelector(selectShareBySource(kind, sourceId));
  const isReady = useAppSelector(selectIsSharesReady);
  const loadError = useAppSelector(selectSharesLoadError);
  const shareCount = useAppSelector((state) => state.pinch.shares.items.length);
  const status = useAppSelector((state) =>
    share ? selectShareStatuses(state).get(share.id) : undefined,
  );
  const recipesById = useAppSelector(selectRecipesById);
  const mealsById = useAppSelector(selectMealsById);
  const ingredientsById = useAppSelector(selectIngredientsById);
  const isBusyRef = useRef(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { thing, inCopy, changed } = COPY[kind];
  const source = getShareSource(kind, sourceId, recipesById, mealsById);
  const isBusy = busy !== null;
  const canSend = typeof navigator.share === 'function';

  const getBlockReason = () => {
    if (source === null) return null;
    const payload = buildSharePayload(source, recipesById, ingredientsById);
    return 'error' in payload ? payload.error : null;
  };
  const blockReason = getBlockReason();
  const hasWebPhoto =
    source !== null &&
    getShareRecipes(source, recipesById).some(
      (recipe) => recipe.coverPath == null && Boolean(recipe.coverUrl),
    );
  const leftOut = `Your name, notes, prices, favorites, cooking history and collections.${hasWebPhoto ? ' A photo from a web search stays out too.' : ''}`;

  const run = async (
    action: BusyAction,
    task: () => Promise<unknown>,
    doneNotice: Notice | null,
  ) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setBusy(action);
    setNotice(null);
    setError(null);
    try {
      await task();
      setNotice(doneNotice);
    } catch (taskError) {
      setError(getErrorMessage(taskError, 'Something went wrong. Try again.'));
    } finally {
      isBusyRef.current = false;
      setBusy(null);
    }
  };

  const save = (action: 'create' | 'update') =>
    run(
      action,
      () => dispatch(saveShare({ kind, sourceId })).unwrap(),
      action === 'update' ? 'updated' : null,
    );

  const handleRenew = async (current: PinchShare) => {
    const confirmed = await confirm({
      title: 'Get a new link',
      message: `The current link stops working right away for everyone who has it, and you get a new one to send. The ${thing} itself stays as it is.`,
      confirmText: 'Get a new link',
      destructive: true,
    });
    if (!confirmed) return;

    await run(
      'renew',
      () => dispatch(renewShareLink(current.id)).unwrap(),
      'renewed',
    );
  };

  const handleStop = async (current: PinchShare) => {
    const confirmed = await confirm({
      title: 'Stop sharing',
      message: `Everyone with the link loses access right away, and the shared copy and its photo are deleted. Your ${thing} stays as it is. This can't be undone.`,
      confirmText: 'Stop sharing',
      destructive: true,
    });
    if (!confirmed) return;

    await run(
      'stop',
      async () => {
        await dispatch(stopSharing(current.id)).unwrap();
        onStopped?.();
      },
      'stopped',
    );
  };

  // The Clipboard API is missing on plain-HTTP pages, where the copy button can't work.
  const copyWithoutClipboardApi = async (url: string) => {
    if (navigator.clipboard && window.isSecureContext) return;

    const didCopy = await copyToClipboard(url);
    addToast(
      didCopy
        ? { title: 'Link copied', type: 'success' }
        : {
            title: "Couldn't copy the link",
            description: 'Select the link above and copy it from there.',
            type: 'error',
          },
    );
  };

  const handleSend = async (url: string) => {
    try {
      await navigator.share({ url });
    } catch (shareError) {
      const isDismissed =
        shareError instanceof DOMException && shareError.name === 'AbortError';
      if (!isDismissed)
        console.error('Pinch could not send the link', shareError);
    }
  };

  const noticeLine = notice !== null && (
    <p
      role='status'
      className='bg-accent/60 border-border rounded-2xl border px-3 py-2 text-sm text-pretty'
    >
      {getNoticeText(notice, thing)}
    </p>
  );
  const errorLine = error !== null && (
    <p role='alert' className='text-destructive text-sm text-pretty'>
      {error}
    </p>
  );

  const copyAndSend = (url: string, variant: 'primary' | 'secondary') => (
    <div className='flex gap-2'>
      <CopyButton
        textToCopy={url}
        variant={variant}
        className='min-w-0 flex-1'
        onClick={() => void copyWithoutClipboardApi(url)}
      >
        Copy link
      </CopyButton>
      {canSend && (
        <Button
          type='button'
          variant='secondary'
          className='gap-1.5'
          onClick={() => void handleSend(url)}
        >
          <Share2 className='h-4 w-4' aria-hidden='true' />
          Send
        </Button>
      )}
    </div>
  );

  const getView = (): { body: ReactNode; footer: ReactNode } => {
    if (loadError !== null) {
      return {
        body: (
          <p className='text-muted-foreground text-sm text-pretty'>
            We couldn't load your shared links just now. Try again in a moment.
          </p>
        ),
        footer: null,
      };
    }
    if (!isReady) {
      return {
        body: (
          <p className='text-muted-foreground text-sm'>
            Loading your shared links…
          </p>
        ),
        footer: null,
      };
    }
    if (share === null) {
      if (!canStart) {
        return {
          body: (
            <p className='text-muted-foreground text-sm'>
              This link is no longer shared.
            </p>
          ),
          footer: null,
        };
      }
      const reason =
        shareCount >= MAX_PINCH_SHARES
          ? `You have ${MAX_PINCH_SHARES} shared links, the most you can have at once. Stop one under Settings, Shared links.`
          : blockReason;

      return {
        body: (
          <div className='space-y-4'>
            {noticeLine}
            <IntroCard
              icon='🔗'
              lead='Anyone with the link can look, no account needed.'
            >
              It's a copy as it is today, so changes you make later aren't in it
              unless you update it.
            </IntroCard>
            <dl className='space-y-3 text-sm'>
              <div>
                <dt className='font-medium'>In the copy</dt>
                <dd className='text-muted-foreground text-pretty'>{inCopy}</dd>
              </div>
              <div>
                <dt className='font-medium'>Left out</dt>
                <dd className='text-muted-foreground text-pretty'>{leftOut}</dd>
              </div>
            </dl>
          </div>
        ),
        footer: (
          <div className='space-y-2'>
            {reason !== null && (
              <p className='text-muted-foreground text-sm text-pretty'>
                {reason}
              </p>
            )}
            {errorLine}
            <Button
              type='button'
              className='w-full'
              loading={busy === 'create'}
              disabled={reason !== null || isBusy}
              onClick={() => void save('create')}
            >
              Create link
            </Button>
          </div>
        ),
      };
    }

    const url = getShareUrl(share.id, window.location.origin);
    const isGone = status?.isGone ?? false;
    const isStale = (status?.isStale ?? false) && notice !== 'updated';
    const verb = share.updatedAt > share.createdAt ? 'Updated' : 'Shared';

    return {
      body: (
        <div className='space-y-4'>
          {noticeLine}
          <div className='space-y-1.5'>
            <p className='bg-muted/50 border-border rounded-xl border px-3 py-2.5 text-sm break-all select-all'>
              {url}
            </p>
            <p className='text-muted-foreground text-sm text-pretty'>
              {verb} on {formatDate(share.updatedAt)}. Anyone with the link can
              look.
            </p>
          </div>
          {isGone && (
            <IntroCard icon='🗑️' lead='The original was deleted.'>
              The link still shows the copy you shared until you stop sharing.
            </IntroCard>
          )}
          {isStale && (
            <>
              <IntroCard icon='✏️' lead={changed}>
                The link still shows the older copy.
              </IntroCard>
              {copyAndSend(url, 'secondary')}
            </>
          )}
          <ActionGroup>
            {!isGone && !isStale && (
              <ActionRow
                isGrouped
                icon={<RefreshCw className='h-4 w-4' />}
                label='Update the shared copy'
                subtitle={
                  blockReason ??
                  (busy === 'update' ? 'Updating…' : 'The link stays the same')
                }
                isDisabled={blockReason !== null || isBusy}
                onClick={() => void save('update')}
              />
            )}
            {!isGone && (
              <ActionRow
                isGrouped
                icon={<Link2 className='h-4 w-4' />}
                label='Get a new link'
                subtitle={
                  busy === 'renew'
                    ? 'Making a new link…'
                    : 'The old one stops working'
                }
                isDisabled={isBusy}
                onClick={() => void handleRenew(share)}
              />
            )}
            <ActionRow
              isGrouped
              isDestructive
              icon={<Link2Off className='h-4 w-4' />}
              label='Stop sharing'
              subtitle={
                busy === 'stop'
                  ? 'Stopping…'
                  : 'The link stops working for good'
              }
              isDisabled={isBusy}
              onClick={() => void handleStop(share)}
            />
          </ActionGroup>
        </div>
      ),
      footer: (
        <div className='space-y-2'>
          {isStale && blockReason !== null && (
            <p className='text-muted-foreground text-sm text-pretty'>
              {blockReason}
            </p>
          )}
          {errorLine}
          {isStale ? (
            <Button
              type='button'
              className='w-full'
              loading={busy === 'update'}
              disabled={blockReason !== null || isBusy}
              onClick={() => void save('update')}
            >
              Update the shared copy
            </Button>
          ) : (
            copyAndSend(url, 'primary')
          )}
        </div>
      ),
    };
  };

  const { body, footer } = getView();

  return (
    <>
      {body}
      {footer !== null &&
        footerNode !== null &&
        createPortal(footer, footerNode)}
    </>
  );
}

export default ShareView;
