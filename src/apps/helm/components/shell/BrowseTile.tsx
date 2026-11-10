import { Button } from '@moondreamsdev/dreamer-ui/components';
import {
  CalendarDays,
  History,
  Inbox,
  Link2,
  ListChecks,
  MapPin,
  Settings2,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import { HELM_COPY } from '@apps/helm/constants';
import type { BrowseImportance } from '@apps/helm/screen/views';
import type { HelmView } from '@apps/helm/types';

const VIEW_ENTRIES: Record<HelmView, { label: string; icon: LucideIcon }> = {
  home: { label: 'Home', icon: CalendarDays },
  today: { label: 'Today', icon: CalendarDays },
  inbox: { label: 'Needs you', icon: Inbox },
  tasks: { label: HELM_COPY.tasksTitle, icon: ListChecks },
  settings: { label: HELM_COPY.settingsTitle, icon: Settings2 },
  activity: { label: HELM_COPY.activityTitle, icon: History },
  connectedApps: { label: HELM_COPY.connectedAppsRowTitle, icon: Link2 },
  connection: { label: HELM_COPY.connectedAppsRowTitle, icon: Link2 },
  people: { label: HELM_COPY.peopleTitle, icon: Users },
  who: { label: HELM_COPY.peopleTitle, icon: Users },
  place: { label: HELM_COPY.linkedPlace, icon: MapPin },
};

interface BrowseTileProps {
  view: HelmView;
  importance: BrowseImportance;
  /** A tile that is big only while it has something waiting; null for a fixed size. */
  grows: 'openQuestions' | null;
  /** What needs the person: unreadable, unsorted and unfinished turns; waiting ones are not counted. */
  openQuestions: number;
  /** Turns not seen yet, said on a growing tile beside what needs the person. */
  newSinceLooked: number;
  /** Spans the row, so a last tile that would sit alone fills it. */
  isWide: boolean;
  onOpen: (view: HelmView) => void;
}

/** One tile of the Browse sheet, sized by how much its view matters. */
function BrowseTile({
  view,
  importance,
  grows,
  openQuestions,
  newSinceLooked,
  isWide,
  onOpen,
}: BrowseTileProps) {
  const { label, icon: Icon } = VIEW_ENTRIES[view];
  const isShrunk = grows === 'openQuestions' && openQuestions === 0;
  const isSmall = importance === 'minor' || isShrunk;

  return (
    <Button
      type='button'
      variant='tertiary'
      className={join(
        'helm-card flex h-auto flex-col items-start justify-between gap-3 p-4 text-left',
        isWide && 'col-span-2',
        isSmall ? 'min-h-20' : 'min-h-28',
      )}
      onClick={() => onOpen(view)}
    >
      <Icon className='text-muted-foreground size-[18px]' aria-hidden='true' />
      <span
        className={join(
          'text-foreground',
          isSmall
            ? 'text-[15px] font-medium'
            : 'helm-serif text-[22px] leading-7',
        )}
      >
        {label}
      </span>
      {grows === 'openQuestions' && (
        <span className='text-muted-foreground -mt-2 flex flex-col text-[13px]'>
          {openQuestions > 0 && (
            <span>{HELM_COPY.needsYouCount(openQuestions)}</span>
          )}
          {newSinceLooked > 0 && (
            <span>{HELM_COPY.newSinceLooked(newSinceLooked)}</span>
          )}
          {openQuestions === 0 && newSinceLooked === 0 && (
            <span>{HELM_COPY.nothingWaiting}</span>
          )}
        </span>
      )}
    </Button>
  );
}

export default BrowseTile;
