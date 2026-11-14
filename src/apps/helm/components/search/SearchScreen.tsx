import { useDeferredValue, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import SearchInput from '@/components/SearchInput';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { canFocusFieldOnOpen } from '@/utils/focusUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { toComparable } from '@/utils/optionMatchUtils';
import SearchGroup from '@apps/helm/components/search/SearchGroup';
import SearchSheets, {
  type SearchOpen,
} from '@apps/helm/components/search/SearchSheets';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { doneTasksQueryOptions } from '@apps/helm/queries/doneTaskQueries';
import { momentsQueryOptions } from '@apps/helm/queries/momentQueries';
import type { HelmView } from '@apps/helm/types';
import {
  SEARCH_GROUPS,
  buildSearchIndex,
  mergeTasks,
  searchEntries,
  type SearchEntry,
  type SearchGroup as GroupId,
  type SearchSources,
} from '@apps/helm/utils/searchRecords';

const GROUP_LABELS: Record<GroupId, string> = {
  people: HELM_COPY.searchGroupPeople,
  tasks: HELM_COPY.searchGroupTasks,
  dates: HELM_COPY.searchGroupDates,
  facts: HELM_COPY.searchGroupFacts,
  notes: HELM_COPY.searchGroupNotes,
  topics: HELM_COPY.searchGroupTopics,
  projects: HELM_COPY.searchGroupProjects,
  procedures: HELM_COPY.searchGroupProcedures,
  places: HELM_COPY.searchGroupPlaces,
  media: HELM_COPY.searchGroupMedia,
  synced: HELM_COPY.searchGroupSynced,
};

const NONE: never[] = [];

const NO_SOURCES: SearchSources = {
  who: NONE,
  places: NONE,
  tasks: NONE,
  facts: NONE,
  byWho: {},
  moments: NONE,
  notes: NONE,
  topics: NONE,
  projects: NONE,
  procedures: NONE,
  media: NONE,
  synced: NONE,
};

interface SearchScreenProps {
  query: string;
  onQueryChange: (query: string) => void;
  onBack: () => void;
  onOpenView: (view: HelmView, id: string | null) => void;
}

/** Search: one field over everything the person told the assistant, found on the device in what is already open, in groups of three with the rest a tap away. A utility screen, with no ask bar. */
function SearchScreen({
  query,
  onQueryChange,
  onBack,
  onOpenView,
}: SearchScreenProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const assistant = useAssistantName();
  const now = useNow(60_000);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const when = useMemo(
    () => ({
      timeZone: profileZone ?? getDeviceTimeZone() ?? 'UTC',
      now: Math.floor(now / 60_000) * 60_000,
      query,
    }),
    [profileZone, now, query],
  );
  const who = useAppSelector((state) => state.helm.who.items);
  const places = useAppSelector((state) => state.helm.places.items);
  const facts = useAppSelector((state) => state.helm.facts.items);
  const notes = useAppSelector((state) => state.helm.notes.items);
  const topics = useAppSelector((state) => state.helm.topics.items);
  const projects = useAppSelector((state) => state.helm.projects.items);
  const procedures = useAppSelector((state) => state.helm.procedures.items);
  const media = useAppSelector((state) => state.helm.media.items);
  const synced = useAppSelector((state) => state.helm.synced.items);
  const projectTasks = useAppSelector((state) => state.helm.projectTasks.items);
  const openTasks = useAppSelector((state) => state.helm.openTasks.items);
  const byWho = useAppSelector((state) => state.helm.keyDateIndex.byWho);
  const isPartFailed = useAppSelector((state) =>
    [
      state.helm.who,
      state.helm.places,
      state.helm.facts,
      state.helm.notes,
      state.helm.topics,
      state.helm.projects,
      state.helm.procedures,
      state.helm.media,
      state.helm.synced,
      state.helm.projectTasks,
      state.helm.openTasks,
      state.helm.keyDateIndex,
    ].some((slice) => slice.isFailed),
  );
  const hasQuery = toComparable(query) !== '';
  const doneTasks = useQuery({
    ...doneTasksQueryOptions(uid),
    enabled: uid !== '',
  });
  const moments = useQuery({
    ...momentsQueryOptions(uid),
    enabled: uid !== '' && hasQuery,
  });
  const [expanded, setExpanded] = useState<{
    query: string;
    groups: GroupId[];
  }>({ query: '', groups: [] });
  const [open, setOpen] = useState<SearchOpen | null>(null);

  const tasks = useMemo(
    () => mergeTasks(doneTasks.data ?? NONE, projectTasks, openTasks),
    [doneTasks.data, projectTasks, openTasks],
  );
  const sources = useMemo<SearchSources>(
    () => ({
      who,
      places,
      tasks,
      facts,
      byWho,
      moments: moments.data ?? NONE,
      notes,
      topics,
      projects,
      procedures,
      media,
      synced,
    }),
    [
      who,
      places,
      tasks,
      facts,
      byWho,
      moments.data,
      notes,
      topics,
      projects,
      procedures,
      media,
      synced,
    ],
  );
  // The field and the page draw first; the index is built in the render after.
  const indexSources = useDeferredValue(sources, NO_SOURCES);
  const isIndexing = indexSources !== sources;
  const index = useMemo(() => buildSearchIndex(indexSources), [indexSources]);
  const results = useMemo(() => searchEntries(index, query), [index, query]);

  const found = SEARCH_GROUPS.reduce(
    (total, group) => total + results[group].length,
    0,
  );
  const openGroups = expanded.query === query ? expanded.groups : [];
  const toggleGroup = (group: GroupId) =>
    setExpanded({
      query,
      groups: openGroups.includes(group)
        ? openGroups.filter((entry) => entry !== group)
        : [...openGroups, group],
    });

  const openEntry = ({ target }: SearchEntry) => {
    if (target.kind === 'view') onOpenView(target.view, target.id);
    else if (target.kind === 'seesYou') onOpenView('howNomosSeesYou', null);
    else setOpen(target);
  };

  return (
    <>
      <HelmHeader
        backLabel='Home'
        onBack={onBack}
        onHome={onBack}
        showsHome={false}
      />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.searchTitle}
        </h1>
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder={HELM_COPY.searchPlaceholder}
          autoFocus={canFocusFieldOnOpen()}
        />
        {!hasQuery && (
          <p className='text-muted-foreground text-[15px] text-pretty'>
            {HELM_COPY.searchHint(assistant)}
          </p>
        )}
        {hasQuery && doneTasks.isPending && (
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.searchLookingDone}
          </p>
        )}
        {hasQuery && moments.isPending && (
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.searchLookingDates}
          </p>
        )}
        {hasQuery && doneTasks.isError && (
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.searchFailedDone}
          </p>
        )}
        {hasQuery && moments.isError && (
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.searchFailedDates}
          </p>
        )}
        {hasQuery && isPartFailed && (
          <p className='text-muted-foreground text-[13px]'>
            {HELM_COPY.searchFailedPart}
          </p>
        )}
        {hasQuery &&
          !isIndexing &&
          !isPartFailed &&
          doneTasks.isSuccess &&
          moments.isSuccess &&
          found === 0 && (
            <p className='text-muted-foreground text-[15px] text-pretty'>
              {HELM_COPY.searchNothing(query.trim(), assistant)}
            </p>
          )}
        {SEARCH_GROUPS.map(
          (group) =>
            results[group].length > 0 && (
              <SearchGroup
                key={group}
                label={GROUP_LABELS[group]}
                entries={results[group]}
                isExpanded={openGroups.includes(group)}
                onToggle={() => toggleGroup(group)}
                when={when}
                onOpen={openEntry}
              />
            ),
        )}
      </main>
      <SearchSheets open={open} tasks={tasks} onClose={() => setOpen(null)} />
    </>
  );
}

export default SearchScreen;
