import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQuery } from '@tanstack/react-query';

import BackLink from '@/components/BackLink';
import type { Fact } from '@/components/FactsLine';
import { useAuth } from '@/hooks/useAuth';
import { useIsShortScreen } from '@/hooks/useIsShortScreen';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNoIndex } from '@/hooks/useNoIndex';
import { formatDate } from '@/utils/formatUtils';
import ShareSlot from '@apps/pinch/components/public/ShareSlot';
import SharedIntro from '@apps/pinch/components/public/SharedIntro';
import SharedMealBody from '@apps/pinch/components/public/SharedMealBody';
import SharedRecipeBody from '@apps/pinch/components/public/SharedRecipeBody';
import {
  SharedFailed,
  SharedNotFound,
  SharedSkeleton,
} from '@apps/pinch/components/public/SharedStates';
import { SHARE_SLOT_COPY } from '@apps/pinch/constants';
import { usePinchTheme } from '@apps/pinch/hooks/usePinchTheme';
import { sharedPinchQueryOptions } from '@apps/pinch/queries/shareQueries';
import type { PinchShareResult, SharedRecipe } from '@apps/pinch/types';
import { getShareTarget } from '@apps/pinch/utils/importShare';
import {
  formatMinutes,
  formatServings,
  getTotalMinutes,
} from '@apps/pinch/utils/recipeFormat';

const SHORT_SCREEN_MAX_HEIGHT = 599;

type OkShare = Extract<PinchShareResult, { status: 'ok' }>;

const getRecipeFacts = (recipe: SharedRecipe): Fact[] => {
  const minutes = getTotalMinutes(recipe);
  return [
    { key: 'servings', content: formatServings(recipe.servings) },
    ...(minutes === null
      ? []
      : [{ key: 'time', content: formatMinutes(minutes) }]),
  ];
};

const countOf = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

interface SharedViewProps {
  shareId: string;
  share: OkShare;
  isChecking: boolean;
}

function SharedView({ shareId, share, isChecking }: SharedViewProps) {
  const target = getShareTarget(share);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const scrollRef = useRef(0);
  const copy = SHARE_SLOT_COPY[share.kind];
  const { isAtLeast } = useMediaQuery();
  const isShort = useIsShortScreen(SHORT_SCREEN_MAX_HEIGHT);
  const isSplit = isAtLeast('lg') || (isAtLeast('sm') && isShort);

  if (target === null) return <SharedNotFound />;

  const openDish = (index: number) => {
    scrollRef.current = window.scrollY;
    setOpenIndex(index);
    window.scrollTo({ top: 0 });
  };

  const closeDish = () => {
    setOpenIndex(null);
    requestAnimationFrame(() => window.scrollTo({ top: scrollRef.current }));
  };

  const getContent = () => {
    if (target.kind === 'RECIPE') {
      return {
        intro: (
          <SharedIntro
            shareId={shareId}
            coverIndex={0}
            hasCover={target.recipe.hasCover}
            emoji={copy.emoji}
            title={target.recipe.title}
            facts={getRecipeFacts(target.recipe)}
            isCompact={isShort}
          />
        ),
        body: <SharedRecipeBody recipe={target.recipe} />,
      };
    }

    if (openIndex !== null) {
      const dish = target.meal.recipes[openIndex];
      return {
        intro: (
          <SharedIntro
            shareId={shareId}
            coverIndex={openIndex}
            hasCover={dish.hasCover}
            emoji={SHARE_SLOT_COPY.RECIPE.emoji}
            title={dish.title}
            facts={getRecipeFacts(dish)}
            isCompact={isShort}
          />
        ),
        body: <SharedRecipeBody recipe={dish} />,
      };
    }

    const recipeCount = target.meal.items.filter(
      (item) => item.kind === 'RECIPE',
    ).length;
    const ingredientCount = target.meal.items.length - recipeCount;
    return {
      intro: (
        <SharedIntro
          shareId={shareId}
          coverIndex={null}
          hasCover={false}
          emoji={copy.emoji}
          title={target.meal.name}
          isCompact={isShort}
          facts={[
            ...(recipeCount > 0
              ? [
                  {
                    key: 'recipes',
                    content: countOf(recipeCount, 'recipe', 'recipes'),
                  },
                ]
              : []),
            ...(ingredientCount > 0
              ? [
                  {
                    key: 'ingredients',
                    content: countOf(
                      ingredientCount,
                      'ingredient',
                      'ingredients',
                    ),
                  },
                ]
              : []),
          ]}
        />
      ),
      body: (
        <SharedMealBody
          shareId={shareId}
          meal={target.meal}
          onOpenRecipe={openDish}
        />
      ),
    };
  };
  const { intro, body } = getContent();

  return (
    <div
      className={join(
        'mx-auto grid gap-4',
        isSplit
          ? 'max-w-5xl grid-cols-[minmax(0,1fr)_20rem] gap-x-10 gap-y-6'
          : 'max-w-2xl',
      )}
    >
      <div
        className={join(
          'flex items-center justify-between gap-3',
          isSplit && 'col-span-2',
        )}
      >
        <span className='flex items-center gap-2.5'>
          <img
            src='/logos/by-app/logo-pinch.svg'
            alt=''
            className='size-9 rounded-xl'
          />
          <span className='font-semibold'>Pinch</span>
        </span>
        <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          {copy.eyebrow}
        </span>
      </div>
      <div className={join('min-w-0 space-y-1', isSplit && 'col-start-1')}>
        {openIndex !== null && <BackLink onBack={closeDish} />}
        {intro}
      </div>
      <ShareSlot
        shareId={shareId}
        target={target}
        isOwner={share.isOwner}
        isChecking={isChecking}
        className={
          isSplit
            ? 'sticky top-6 col-start-2 row-span-2 row-start-2 self-start'
            : undefined
        }
      />
      <div className={join('min-w-0', isSplit && 'col-start-1')}>{body}</div>
      <p
        className={join(
          'text-muted-foreground text-center text-xs text-pretty',
          isSplit && 'col-start-1',
        )}
      >
        A snapshot from {formatDate(share.sharedAt)}, so it won&apos;t change if
        the original does.
      </p>
    </div>
  );
}

/** The public page behind a share link: no sign-in to look, and nothing that says whose it is. */
function SharedPinch() {
  const { shareId = '' } = useParams();
  const { user, loading } = useAuth();
  const query = useQuery({
    ...sharedPinchQueryOptions(shareId, user?.uid ?? null),
    enabled: !loading,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === shareId ? previous : undefined,
  });

  usePinchTheme();
  useNoIndex();

  const getContent = () => {
    if (query.isError)
      return <SharedFailed onRetry={() => void query.refetch()} />;
    if (query.data === undefined) return <SharedSkeleton />;
    if (query.data.status === 'not_found') return <SharedNotFound />;

    return (
      <SharedView
        key={shareId}
        shareId={shareId}
        share={query.data}
        isChecking={query.isPlaceholderData}
      />
    );
  };

  return (
    <div className='page pb-16'>
      <div className='mx-auto max-w-5xl py-6'>{getContent()}</div>
    </div>
  );
}

export default SharedPinch;
