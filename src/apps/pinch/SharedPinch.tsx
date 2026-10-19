import { useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';

import type { Fact } from '@/components/FactsLine';
import { useAuth } from '@/hooks/useAuth';
import { useBackStep } from '@/hooks/useBackHistory';
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

interface BackLinkProps {
  onBack: () => void;
}

function BackLink({ onBack }: BackLinkProps) {
  useBackStep(true, onBack);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='h-10 gap-1 px-0!'
      onClick={onBack}
    >
      <ChevronLeft className='h-4 w-4' aria-hidden='true' />
      Back
    </Button>
  );
}

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

  useLayoutEffect(() => {
    window.scrollTo({ top: openIndex === null ? scrollRef.current : 0 });
  }, [openIndex]);

  if (target === null) return <SharedNotFound />;

  const openDish = (index: number) => {
    scrollRef.current = window.scrollY;
    setOpenIndex(index);
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
    <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-10 lg:gap-y-6'>
      <div className='flex items-center justify-between gap-3 lg:col-span-2'>
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
      <div className='min-w-0 space-y-1 lg:col-start-1'>
        {openIndex !== null && <BackLink onBack={() => setOpenIndex(null)} />}
        {intro}
      </div>
      <ShareSlot
        shareId={shareId}
        target={target}
        isOwner={share.isOwner}
        isChecking={isChecking}
        className='lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:self-start'
      />
      <div className='min-w-0 lg:col-start-1'>{body}</div>
      <p className='text-muted-foreground text-center text-xs text-pretty lg:col-start-1'>
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
      <div className='mx-auto max-w-2xl py-6 lg:max-w-5xl'>{getContent()}</div>
    </div>
  );
}

export default SharedPinch;
