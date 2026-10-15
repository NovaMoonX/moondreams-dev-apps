import { useMemo, useState, type CSSProperties } from 'react';

import LazyMount from '@/components/LazyMount';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import { useAppSelector } from '@/store';
import IdeaAddSheet from '@apps/pinch/components/ideas/IdeaAddSheet';
import IdeaDrawer from '@apps/pinch/components/ideas/IdeaDrawer';
import IdeaFormSheet from '@apps/pinch/components/ideas/IdeaFormSheet';
import IdeaRow from '@apps/pinch/components/ideas/IdeaRow';
import { LIST_SEARCH_THRESHOLD, SOFT_MAX_IDEAS } from '@apps/pinch/constants';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import {
  selectIdeaGroups,
  selectIdeas,
  selectIdeasById,
  selectIdeasLoadError,
} from '@apps/pinch/store/selectors';
import type { Idea } from '@apps/pinch/types';
import { searchByName } from '@apps/pinch/utils/catalogSearch';
import {
  getIdeaRecipeMethod,
  getIdeaSearchText,
} from '@apps/pinch/utils/ideas';

const filterIdeas = (ideas: Idea[], query: string) =>
  searchByName(
    ideas.map((idea) => ({ name: getIdeaSearchText(idea), idea })),
    query,
  ).map(({ idea }) => idea);

const IDEA_CHUNK = 20;
const EAGER_IDEA_CHUNKS = 1;
const ROW_HEIGHT = 73;

interface IdeaRowsProps {
  ideas: Idea[];
  isEager: boolean;
  onOpen: (id: string) => void;
}

function IdeaRows({ ideas, isEager, onOpen }: IdeaRowsProps) {
  return (
    <div>
      {Array.from(
        { length: Math.ceil(ideas.length / IDEA_CHUNK) },
        (_, chunk) => {
          const rows = ideas.slice(
            chunk * IDEA_CHUNK,
            (chunk + 1) * IDEA_CHUNK,
          );
          const estimatedHeight = rows.length * ROW_HEIGHT;
          return (
            <div
              key={chunk}
              className='defer-offscreen'
              style={
                { '--defer-size': `${estimatedHeight}px` } as CSSProperties
              }
            >
              <LazyMount
                estimatedHeight={estimatedHeight}
                eager={isEager && chunk < EAGER_IDEA_CHUNKS}
              >
                <ul className='divide-border divide-y lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0'>
                  {rows.map((idea) => (
                    <li key={idea.id} className='lg:border-border lg:border-b'>
                      <IdeaRow idea={idea} onOpen={onOpen} />
                    </li>
                  ))}
                </ul>
              </LazyMount>
            </div>
          );
        },
      )}
    </div>
  );
}

type Overlay = { kind: 'drawer'; id: string } | { kind: 'edit'; id: string };

interface IdeasViewProps {
  uid: string;
  /** What the search starts with, when the person came here from a search that found an idea. */
  initialQuery: string;
  isAddOpen: boolean;
  onAddClose: () => void;
  onOpenRecipe: (recipeId: string) => void;
}

function IdeasView({
  uid,
  initialQuery,
  isAddOpen,
  onAddClose,
  onOpenRecipe,
}: IdeasViewProps) {
  const { openSubview } = usePinchOverlay();
  const ideas = useAppSelector(selectIdeas);
  const ideasById = useAppSelector(selectIdeasById);
  const { toTry, made } = useAppSelector(selectIdeaGroups);
  const loadError = useAppSelector(selectIdeasLoadError);
  const isLoaded = useAppSelector((state) => state.pinch.ideas.isLoaded);
  const [query, setQuery] = useState(initialQuery);
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  const hasSearch = ideas.length >= LIST_SEARCH_THRESHOLD;
  const trimmed = hasSearch ? query.trim() : '';
  const shownToTry = useMemo(
    () => filterIdeas(toTry, trimmed),
    [toTry, trimmed],
  );
  const shownMade = useMemo(() => filterIdeas(made, trimmed), [made, trimmed]);

  const openIdea = overlay ? (ideasById.get(overlay.id) ?? null) : null;

  const getBody = () => {
    if (loadError !== null) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          We couldn't load your ideas just now. Check your connection and try
          again.
        </p>
      );
    }
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Loading your ideas…
        </p>
      );
    }
    if (ideas.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm'>
          Saw something you'd like to cook someday? Keep it here.
        </p>
      );
    }
    if (shownToTry.length === 0 && shownMade.length === 0) {
      return (
        <p className='text-muted-foreground py-6 text-center text-sm wrap-break-word'>
          Nothing matches “{trimmed}” yet.
        </p>
      );
    }

    const handleOpen = (id: string) => setOverlay({ kind: 'drawer', id });
    const hasBoth = shownToTry.length > 0 && shownMade.length > 0;
    return (
      <div className='space-y-3'>
        {shownToTry.length > 0 && (
          <section aria-label='Still to try' className='space-y-1'>
            {made.length > 0 && <SectionDivider label='Still to try' />}
            <IdeaRows ideas={shownToTry} isEager onOpen={handleOpen} />
          </section>
        )}
        {shownMade.length > 0 && (
          <section aria-label='Made into recipes' className='space-y-1'>
            <SectionDivider label='Made into recipes' />
            <IdeaRows
              ideas={shownMade}
              isEager={!hasBoth}
              onOpen={handleOpen}
            />
          </section>
        )}
      </div>
    );
  };

  return (
    <div className='space-y-4'>
      {ideas.length >= SOFT_MAX_IDEAS && loadError === null && (
        <p className='text-muted-foreground text-sm'>
          Your list holds up to {SOFT_MAX_IDEAS} ideas. Delete one to add
          another.
        </p>
      )}
      {hasSearch && loadError === null && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder='Search ideas'
        />
      )}
      {getBody()}
      {isAddOpen && (
        <IdeaAddSheet
          uid={uid}
          onClose={onAddClose}
          onOpenExisting={(id) => {
            onAddClose();
            setOverlay({ kind: 'drawer', id });
          }}
        />
      )}
      {overlay?.kind === 'drawer' && openIdea && (
        <IdeaDrawer
          key={openIdea.id}
          idea={openIdea}
          onClose={() => setOverlay(null)}
          onModify={(id) => setOverlay({ kind: 'edit', id })}
          onTurnIntoRecipe={(id) => {
            setOverlay(null);
            openSubview({
              kind: 'recipe',
              id: null,
              method: getIdeaRecipeMethod(openIdea),
              fromIdeaId: id,
            });
          }}
          onOpenRecipe={(recipeId) => {
            setOverlay(null);
            onOpenRecipe(recipeId);
          }}
        />
      )}
      {overlay?.kind === 'edit' && openIdea && (
        <IdeaFormSheet
          key={openIdea.id}
          uid={uid}
          idea={openIdea}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

export default IdeasView;
