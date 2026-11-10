import { useMemo, useState } from 'react';

import LazyMount from '@/components/LazyMount';
import AppToggle from '@/components/AppToggle';
import SearchInput from '@/components/SearchInput';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import ComingUpRow from '@apps/helm/components/comingUp/ComingUpRow';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import {
  COMING_UP_MONTH_ROWS,
  COMING_UP_SEARCH_FROM,
  HELM_COPY,
} from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import { selectComingUp } from '@apps/helm/store/selectors/keyDateSelectors';
import {
  formatMonthHeading,
  getCloseness,
  groupByMonth,
} from '@apps/helm/utils/keyDateUpcoming';

interface ComingUpViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenWho: (whoId: string) => void;
}

const ROW_HEIGHT = 52;

/** Coming up: everyone's dates that come back for the next 12 months, by month, with passing people behind "Show everyone". Read from the index alone. */
function ComingUpView({ onBack, onHome, onOpenWho }: ComingUpViewProps) {
  const assistant = useAssistantName();
  const todayKey = useTodayKey();
  const { isLoaded, isFailed } = useAppSelector(
    (state) => state.helm.keyDateIndex,
  );
  const dates = useAppSelector((state) => selectComingUp(state, todayKey));
  const [isEveryone, setIsEveryone] = useState(false);
  const [search, setSearch] = useState('');
  const [openMonths, setOpenMonths] = useState<ReadonlySet<string>>(new Set());

  useScreenContext('comingUp', null, [], {
    ask: HELM_COPY.askComingUp,
    chip: HELM_COPY.chipComingUp,
    back: HELM_COPY.backToComingUp,
  });

  const shown = useMemo(
    () =>
      dates.filter(
        (date) =>
          isEveryone ||
          getCloseness({
            tier: date.tier,
            kind: date.whoKind,
            isSelf: date.isSelf,
          }) < 2,
      ),
    [dates, isEveryone],
  );
  const isSearching = search.trim() !== '';
  const needle = search.trim().toLowerCase();
  const matched = useMemo(
    () =>
      isSearching
        ? shown.filter((date) => date.title.toLowerCase().includes(needle))
        : shown,
    [shown, isSearching, needle],
  );
  const months = useMemo(() => groupByMonth(matched), [matched]);
  const hiddenPassing = dates.length - shown.length;

  return (
    <>
      <HelmHeader backLabel='Today' onBack={onBack} onHome={onHome} />
      <main className='space-y-4 pt-4'>
        <div className='space-y-1'>
          <h1 className='helm-serif text-[28px] leading-[34px]'>
            {HELM_COPY.comingUpTitle}
          </h1>
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.comingUpSubtitle}
          </p>
        </div>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.comingUpFailed}
          </p>
        )}
        {isLoaded && dates.length === 0 && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.comingUpEmpty(assistant)}
          </p>
        )}
        {dates.length > 0 && (
          <label className='flex min-h-10 items-center justify-between gap-3 text-[15px]'>
            <span>{HELM_COPY.comingUpShowEveryone}</span>
            <AppToggle
              aria-label={HELM_COPY.comingUpShowEveryone}
              checked={isEveryone}
              onCheckedChange={setIsEveryone}
            />
          </label>
        )}
        {shown.length >= COMING_UP_SEARCH_FROM && (
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={HELM_COPY.comingUpSearchLabel}
          />
        )}
        {dates.length > 0 && shown.length === 0 && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.comingUpNoneShown}
          </p>
        )}
        {isSearching && matched.length === 0 && shown.length > 0 && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.comingUpSearchNone}
          </p>
        )}
        {months.map((month, index) => {
          const isOpen = openMonths.has(month.key) || isSearching;
          const visible = isOpen
            ? month.dates
            : month.dates.slice(0, COMING_UP_MONTH_ROWS);
          const hidden = month.dates.length - visible.length;
          const heading = formatMonthHeading(month.key, todayKey);
          return (
            <LazyMount
              key={month.key}
              eager={index < 2}
              estimatedHeight={
                Math.min(month.dates.length, COMING_UP_MONTH_ROWS) *
                  ROW_HEIGHT +
                40
              }
            >
              <section className='space-y-3'>
                <SectionDivider label={heading} />
                <ul className='helm-card divide-border divide-y overflow-hidden'>
                  {visible.map((date) => (
                    <li key={date.id}>
                      <ComingUpRow date={date} onOpen={onOpenWho} />
                    </li>
                  ))}
                </ul>
                {hidden > 0 && (
                  <ShowMoreButton
                    onClick={() =>
                      setOpenMonths((open) => new Set([...open, month.key]))
                    }
                  >
                    {HELM_COPY.comingUpShowMore(hidden, heading.split(' ')[0])}
                  </ShowMoreButton>
                )}
              </section>
            </LazyMount>
          );
        })}
        {hiddenPassing > 0 && !isEveryone && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.comingUpPassingHint(hiddenPassing)}
          </p>
        )}
      </main>
    </>
  );
}

export default ComingUpView;
