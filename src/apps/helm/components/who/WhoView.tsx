import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, UserPlus } from 'lucide-react';

import LazyMount from '@/components/LazyMount';
import LockedButton from '@/components/LockedButton';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import InferredFacts from '@apps/helm/components/who/InferredFacts';
import SourceRing from '@apps/helm/components/who/SourceRing';
import WhoRow from '@apps/helm/components/who/WhoRow';
import { HELM_COPY } from '@apps/helm/constants';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import type { OpenWho } from '@apps/helm/types';
import { groupWho } from '@apps/helm/utils/whoGroups';

const SEARCH_FROM = 8;
const ROWS_PER_CHUNK = 40;
const ROW_HEIGHT = 65.5;

const toChunks = (list: OpenWho[]) =>
  Array.from({ length: Math.ceil(list.length / ROWS_PER_CHUNK) }, (_, index) =>
    list.slice(index * ROWS_PER_CHUNK, (index + 1) * ROWS_PER_CHUNK),
  );

interface WhoViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenWho: (whoId: string) => void;
}

/** People: Close and Regular, A to Z each, then everyone else folded behind a count. */
function WhoView({ onBack, onHome, onOpenWho }: WhoViewProps) {
  const { items, isLoaded, isFailed } = useAppSelector(
    (state) => state.helm.who,
  );
  const assistant = useAssistantName();
  const { openContacts } = useGoogleConnect();
  const isOffline = useNetworkStatus() === 'offline';
  const [search, setSearch] = useState('');
  const [isOthersOpen, setIsOthersOpen] = useState(false);
  const [isInferredOpen, setIsInferredOpen] = useState(false);
  const inferredCount = useAppSelector((state) => {
    const known = new Set([
      ...state.helm.who.items.map((entry) => entry.id),
      ...state.helm.places.items.map((entry) => entry.id),
    ]);
    return state.helm.facts.items.filter(
      (fact) =>
        fact.status === 'inferred' &&
        [...fact.whoIds, ...fact.placeIds].some((id) => known.has(id)),
    ).length;
  });
  const groups = useMemo(() => groupWho(items, search), [items, search]);
  const isSearching = search.trim() !== '';
  const isOthersShown = isOthersOpen || isSearching;
  const count = items.filter((entry) => !entry.isUnreadable).length;
  const isNoMatch =
    isSearching &&
    groups.close.length + groups.regular.length + groups.others.length === 0;

  useScreenContext('people', null, [], {
    ask: HELM_COPY.askPeople(count),
    chip: HELM_COPY.chipPeople(count),
    back: HELM_COPY.backToPeople,
  });

  const renderRows = (list: OpenWho[]) => (
    <div className='helm-card divide-border divide-y overflow-hidden'>
      {toChunks(list).map((chunk, index) => (
        <LazyMount
          key={chunk[0].id}
          eager={index === 0}
          estimatedHeight={chunk.length * ROW_HEIGHT}
        >
          <ul className='divide-border divide-y'>
            {chunk.map((entry) => (
              <li key={entry.id}>
                <WhoRow who={entry} onOpen={onOpenWho} />
              </li>
            ))}
          </ul>
        </LazyMount>
      ))}
    </div>
  );

  const renderGroup = (label: string, list: OpenWho[]) =>
    list.length > 0 && (
      <section className='space-y-3'>
        <SectionDivider label={label} />
        {renderRows(list)}
      </section>
    );

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.peopleTitle}
        </h1>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.peopleFailed}
          </p>
        )}
        {isLoaded && items.length === 0 && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.peopleEmpty(assistant)}
          </p>
        )}
        {items.length >= SEARCH_FROM && (
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={HELM_COPY.peopleSearch}
          />
        )}
        {inferredCount > 0 && (
          <Button
            type='button'
            variant='tertiary'
            onClick={() => setIsInferredOpen(true)}
            className='border-border text-foreground! h-10 w-full min-w-0 justify-between! gap-2 rounded-xl border px-3! text-sm font-normal'
          >
            <span className='flex min-w-0 items-center gap-2'>
              <SourceRing
                isConfirmed={false}
                label={HELM_COPY.factRingInferred(assistant)}
              />
              <span className='text-foreground truncate'>
                {HELM_COPY.inferredDoor(inferredCount)}
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        )}
        {isOffline ? (
          <LockedButton
            label={HELM_COPY.contactsBringIn}
            title={HELM_COPY.connectionsNeedConnection}
            className='h-10 w-full justify-start rounded-xl'
          >
            <p>{HELM_COPY.connectionsNeedConnectionBody}</p>
          </LockedButton>
        ) : (
          <Button
            type='button'
            variant='tertiary'
            onClick={openContacts}
            className='border-border text-foreground! h-10 w-full min-w-0 justify-between! gap-2 rounded-xl border px-3! text-sm font-normal'
          >
            <span className='text-muted-foreground flex min-w-0 items-center gap-2'>
              <UserPlus className='size-4 shrink-0' aria-hidden='true' />
              <span className='text-foreground truncate'>
                {HELM_COPY.contactsBringIn}
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        )}
        {isNoMatch && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.peopleNoMatch}
          </p>
        )}
        {renderGroup(HELM_COPY.tierClose, groups.close)}
        {renderGroup(HELM_COPY.tierRegular, groups.regular)}
        {groups.others.length > 0 && (
          <section className='space-y-3'>
            <SectionDivider label={HELM_COPY.othersDivider} />
            {!isSearching && (
              <ShowMoreButton
                isOpen={isOthersOpen}
                onClick={() => setIsOthersOpen((isOpen) => !isOpen)}
              >
                {isOthersOpen
                  ? HELM_COPY.hideOthers
                  : HELM_COPY.showOthers(groups.others.length)}
              </ShowMoreButton>
            )}
            {isOthersShown && renderRows(groups.others)}
          </section>
        )}
      </main>
      {isInferredOpen && (
        <InferredFacts onClose={() => setIsInferredOpen(false)} />
      )}
    </>
  );
}

export default WhoView;
