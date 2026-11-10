import { useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { UserPlus } from 'lucide-react';

import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import WhoRow from '@apps/helm/components/who/WhoRow';
import { HELM_COPY } from '@apps/helm/constants';
import { useGoogleConnect } from '@apps/helm/hooks/useGoogleConnect';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import type { OpenWho } from '@apps/helm/types';
import { groupWho } from '@apps/helm/utils/whoGroups';

const SEARCH_FROM = 8;

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
  const [search, setSearch] = useState('');
  const [isOthersOpen, setIsOthersOpen] = useState(false);
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

  const renderGroup = (label: string, list: OpenWho[]) =>
    list.length > 0 && (
      <section className='space-y-3'>
        <SectionDivider label={label} />
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {list.map((entry) => (
            <li key={entry.id}>
              <WhoRow who={entry} onOpen={onOpenWho} />
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <HelmHeader backLabel='Home' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.peopleTitle}
        </h1>
        <Button
          type='button'
          variant='secondary'
          className='w-full justify-start gap-2'
          onClick={openContacts}
        >
          <UserPlus className='size-4 shrink-0' aria-hidden='true' />
          {HELM_COPY.contactsBringIn}
        </Button>
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
            {isOthersShown && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {groups.others.map((entry) => (
                  <li key={entry.id}>
                    <WhoRow who={entry} onOpen={onOpenWho} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}

export default WhoView;
