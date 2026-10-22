import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button, Checkbox } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Link2, Link2Off, RefreshCw, Share2 } from 'lucide-react';

import ActionChips from '@/components/ActionChips';
import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import CopyTextButton from '@/components/CopyTextButton';
import IntroCard from '@/components/IntroCard';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppDispatch, useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDate } from '@/utils/formatUtils';
import { MAX_PINCH_SHARES } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  renewShareLink,
  saveShare,
  stopSharing,
} from '@apps/pinch/store/actions/shareActions';
import {
  selectIngredientsById,
  selectIsSharesReady,
  selectMealsById,
  selectNotesByRecipe,
  selectRecipesById,
  selectShareBySource,
  selectShareNotesBlock,
  selectShareStatuses,
  selectSharesLoadError,
} from '@apps/pinch/store/selectors';
import type { PinchShare, ShareKind } from '@apps/pinch/types';
import {
  buildSharePayload,
  getShareIncludes,
  getShareRecipes,
  getShareSource,
  getShareUrl,
  type ShareIncludes,
} from '@apps/pinch/utils/sharing';

const SHORT_SCREEN_MAX_HEIGHT = 599;
const LANDSCAPE_MIN_WIDTH_QUERY = '(min-width: 520px)';

const subscribeToWidth = (onChange: () => void) => {
  const list = window.matchMedia(LANDSCAPE_MIN_WIDTH_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
};

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

interface IncludeChoicesProps {
  tipCount: number;
  noteCount: number;
  includes: ShareIncludes;
  isDisabled: boolean;
  onChange: (includes: ShareIncludes) => void;
}

function IncludeChoices({
  tipCount,
  noteCount,
  includes,
  isDisabled,
  onChange,
}: IncludeChoicesProps) {
  const rows = [
    {
      key: 'tips' as const,
      label: 'Your tips',
      count: tipCount,
      hint: 'Advice for making it, under the step it belongs to.',
    },
    {
      key: 'notes' as const,
      label: 'Your notes',
      count: noteCount,
      hint: 'Shown as you wrote them. Planned changes stay out.',
    },
  ].filter((row) => row.count > 0 || includes[row.key]);
  if (rows.length === 0) return null;

  return (
    <fieldset className='space-y-1'>
      <legend className='text-sm font-medium'>Include</legend>
      {rows.map((row) => (
        <label
          key={row.key}
          className='flex min-h-12 cursor-pointer items-start gap-3 py-2'
        >
          <span className='mt-0.5 inline-flex shrink-0'>
            <Checkbox
              aria-label={row.label}
              checked={includes[row.key]}
              disabled={isDisabled}
              onCheckedChange={(checked) =>
                onChange({ ...includes, [row.key]: checked === true })
              }
            />
          </span>
          <span className='min-w-0'>
            <span className='block text-sm'>
              {row.label}{' '}
              <span className='text-muted-foreground whitespace-nowrap'>
                · {row.count}
              </span>
            </span>
            <span className='text-muted-foreground block text-sm text-pretty'>
              {row.hint}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

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
  /** Closes the sheet this view is in. With it, the cap line gets a door to Shared links that closes the sheet first; without it the line has none. */
  onClose?: () => void;
}

function ShareView({
  kind,
  sourceId,
  canStart = true,
  onStopped,
  footerNode,
  onClose,
}: ShareViewProps) {
  const dispatch = useAppDispatch();
  const { openSubview } = usePinchOverlay();
  const isBelowLg = useMediaQuery().isBelow('lg');
  const isShort = useIsShortScreen(SHORT_SCREEN_MAX_HEIGHT);
  const isWideEnough = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(LANDSCAPE_MIN_WIDTH_QUERY).matches,
    () => false,
  );
  const isLandscape = isShort && isWideEnough && isBelowLg;
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
  const notesByRecipe = useAppSelector(selectNotesByRecipe);
  const notesBlock = useAppSelector(selectShareNotesBlock);
  const isBusyRef = useRef(false);
  const [tipsChoice, setTipsChoice] = useState<boolean | null>(null);
  const [notesChoice, setNotesChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { thing, inCopy, changed } = COPY[kind];
  const source = getShareSource(kind, sourceId, recipesById, mealsById);
  const isBusy = busy !== null;
  const canSend = typeof navigator.share === 'function';

  const shared = share === null ? null : getShareIncludes(share);
  const includes: ShareIncludes = {
    tips: tipsChoice ?? shared?.tips ?? false,
    notes: notesChoice ?? shared?.notes ?? false,
  };
  const isIncludesChanged =
    shared !== null &&
    (includes.tips !== shared.tips || includes.notes !== shared.notes);
  const recipes = source === null ? [] : getShareRecipes(source, recipesById);
  const countEntries = (kind: 'TIP' | 'NOTE') =>
    recipes.reduce(
      (sum, recipe) =>
        sum +
        (notesByRecipe.get(recipe.id) ?? []).filter(
          (note) => note.kind === kind && (note.text ?? '').trim() !== '',
        ).length,
      0,
    );
  const tipCount = countEntries('TIP');
  const noteCount = countEntries('NOTE');

  const getBlockReason = () => {
    if (source === null) return null;
    if ((includes.tips || includes.notes) && notesBlock !== null) {
      return notesBlock;
    }
    const payload = buildSharePayload(
      source,
      recipesById,
      ingredientsById,
      notesByRecipe,
      includes,
    );
    return 'error' in payload ? payload.error : null;
  };
  const blockReason = getBlockReason();
  const hasWebPhoto = recipes.some(
    (recipe) => recipe.coverPath == null && Boolean(recipe.coverUrl),
  );
  const hasEntries = tipCount + noteCount > 0;
  const leftOut = `Your name, planned changes, prices, favorites, cooking history and collections.${hasEntries ? ' Tips and notes too, unless you include them.' : ''}${hasWebPhoto ? ' A photo from a web search stays out too.' : ''}`;
  const includeChoices = (
    <IncludeChoices
      tipCount={tipCount}
      noteCount={noteCount}
      includes={includes}
      isDisabled={isBusy}
      onChange={(next) => {
        setTipsChoice(next.tips);
        setNotesChoice(next.notes);
      }}
    />
  );

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
      setTipsChoice(null);
      setNotesChoice(null);
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
      () => dispatch(saveShare({ kind, sourceId, includes })).unwrap(),
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

  const handleCopyFailed = () =>
    addToast({
      title: "Couldn't copy the link",
      description: 'Select the link above and copy it from there.',
      type: 'error',
    });

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

  const copyActions = (
    url: string,
    variant: 'primary' | 'secondary',
    copyClassName: string,
  ) => (
    <>
      <CopyTextButton
        text={url}
        label='Copy link'
        variant={variant}
        className={copyClassName}
        onFailed={handleCopyFailed}
      />
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
    </>
  );

  const getFooterAction = (url: string, isStale: boolean) => {
    if (!isStale) {
      return (
        <div className='flex gap-2'>
          {copyActions(url, 'primary', 'min-w-0 flex-1')}
        </div>
      );
    }
    const updateButton = (
      <Button
        type='button'
        className={join('min-w-0', isLandscape ? 'flex-1' : 'w-full')}
        loading={busy === 'update'}
        disabled={blockReason !== null || isBusy}
        onClick={() => void save('update')}
      >
        Update the shared copy
      </Button>
    );
    if (!isLandscape) return updateButton;
    return (
      <div className='flex gap-2'>
        {copyActions(url, 'secondary', 'shrink-0')}
        {updateButton}
      </div>
    );
  };

  const openSharedLinks = () => {
    onClose?.();
    openSubview({ kind: 'shares' });
  };

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
      const isCapped = shareCount >= MAX_PINCH_SHARES;
      const reason = isCapped
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
            {!isCapped && includeChoices}
            {!isCapped && (
              <dl className='space-y-3 text-sm'>
                <div>
                  <dt className='font-medium'>In the copy</dt>
                  <dd className='text-muted-foreground text-pretty'>
                    {inCopy}
                  </dd>
                </div>
                <div>
                  <dt className='font-medium'>Left out</dt>
                  <dd className='text-muted-foreground text-pretty'>
                    {leftOut}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        ),
        footer: (
          <div className='space-y-2'>
            {reason !== null && (
              <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                <p className='text-muted-foreground min-w-48 flex-1 text-sm text-pretty'>
                  {reason}
                </p>
                {isCapped && onClose !== undefined && (
                  <ActionChips
                    className='shrink-0'
                    actions={[
                      {
                        key: 'shared-links',
                        icon: <Link2 className='h-4 w-4' />,
                        label: 'Your shared links',
                        onClick: openSharedLinks,
                      },
                    ]}
                  />
                )}
              </div>
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
    const isSourceStale = (status?.isStale ?? false) && notice !== 'updated';
    const isStale = isSourceStale || isIncludesChanged;
    const verb = share.updatedAt > share.createdAt ? 'Updated' : 'Shared';

    return {
      body: (
        <div
          className={join(
            'grid',
            isShort ? 'gap-3' : 'gap-4',
            isLandscape && 'grid-cols-2 items-start gap-x-6',
          )}
        >
          <div className={join('min-w-0', isShort ? 'space-y-3' : 'space-y-4')}>
            {noticeLine}
            <div className='space-y-1.5'>
              <p className='bg-muted/50 border-border rounded-xl border px-3 py-2.5 text-sm break-all select-all'>
                {url}
              </p>
              {!isShort && (
                <p className='text-muted-foreground text-sm text-pretty'>
                  {verb} on {formatDate(share.updatedAt)}. Anyone with the link
                  can look.
                </p>
              )}
            </div>
            {!isGone && includeChoices}
            {isGone && (
              <IntroCard icon='🗑️' lead='The original was deleted.'>
                The link still shows the copy you shared until you stop sharing.
              </IntroCard>
            )}
            {isStale && (
              <>
                <IntroCard
                  icon='✏️'
                  lead={isSourceStale ? changed : 'You changed what to include.'}
                >
                  The link still shows the older copy.
                </IntroCard>
                {!isLandscape && (
                  <div className='flex gap-2'>
                    {copyActions(url, 'secondary', 'min-w-0 flex-1')}
                  </div>
                )}
              </>
            )}
          </div>
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
          {getFooterAction(url, isStale)}
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
