import {
  MessagesSquare,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarHeart,
  ClipboardList,
  FolderKanban,
  History,
  Inbox,
  Link2,
  ListChecks,
  ListOrdered,
  MapPin,
  Search,
  Settings2,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { HELM_COPY } from '@apps/helm/constants';
import type { HelmView } from '@apps/helm/types';

/** Each view's name and icon, as Browse's tiles and the desktop sidebar show it. */
export const VIEW_ENTRIES: Record<
  HelmView,
  { label: string | ((assistant: string) => string); icon: LucideIcon }
> = {
  home: { label: 'Home', icon: CalendarDays },
  today: { label: 'Today', icon: CalendarDays },
  inbox: { label: 'Needs you', icon: Inbox },
  tasks: { label: HELM_COPY.tasksTitle, icon: ListChecks },
  comingUp: { label: HELM_COPY.comingUpTile, icon: CalendarHeart },
  settings: { label: HELM_COPY.settingsTitle, icon: Settings2 },
  activity: { label: HELM_COPY.activityTitle, icon: History },
  outside: { label: HELM_COPY.outsideTitle, icon: MessagesSquare },
  connectedApps: { label: HELM_COPY.connectedAppsRowTitle, icon: Link2 },
  connection: { label: HELM_COPY.connectedAppsRowTitle, icon: Link2 },
  assistants: { label: HELM_COPY.assistantsRowTitle, icon: Link2 },
  people: { label: HELM_COPY.peopleTitle, icon: Users },
  who: { label: HELM_COPY.peopleTitle, icon: Users },
  place: { label: HELM_COPY.linkedPlace, icon: MapPin },
  projects: { label: HELM_COPY.projectsTitle, icon: FolderKanban },
  project: { label: HELM_COPY.projectsTitle, icon: FolderKanban },
  habits: { label: HELM_COPY.habitsTitle, icon: CalendarCheck },
  habit: { label: HELM_COPY.habitsTitle, icon: CalendarCheck },
  scheduled: { label: HELM_COPY.scheduledTitle, icon: CalendarClock },
  knowledge: { label: HELM_COPY.knowledgeTitle, icon: BookOpen },
  topic: { label: HELM_COPY.knowledgeTitle, icon: BookOpen },
  procedures: { label: HELM_COPY.proceduresTitle, icon: ClipboardList },
  procedure: { label: HELM_COPY.proceduresTitle, icon: ClipboardList },
  run: { label: HELM_COPY.proceduresTitle, icon: ClipboardList },
  howNomosSeesYou: { label: HELM_COPY.seesYouTitle, icon: UserRound },
  importance: { label: HELM_COPY.importanceTitle, icon: ListOrdered },
  search: { label: HELM_COPY.searchTitle, icon: Search },
};
