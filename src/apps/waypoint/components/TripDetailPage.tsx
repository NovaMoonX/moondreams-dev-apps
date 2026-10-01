import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  Badge,
  Button,
  Drawer,
  DropdownMenu,
  DropdownMenuFactories,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronLeft } from '@moondreamsdev/dreamer-ui/symbols';
import {
  Archive,
  ArchiveRestore,
  Calendar,
  Image,
  Link,
  LoaderCircle,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';

import { useAppDispatch } from '@/store';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { copyToClipboard } from '@/utils/clipboardUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import { getErrorMessage } from '@/utils/errorUtils';

import AnnouncementFormModal from '@apps/waypoint/components/AnnouncementFormModal';
import ChecklistSection from '@apps/waypoint/components/ChecklistSection';
import EditTripCoverModal from '@apps/waypoint/components/EditTripCoverModal';
import EditTripDatesModal from '@apps/waypoint/components/EditTripDatesModal';
import EditTripTitleModal from '@apps/waypoint/components/EditTripTitleModal';
import ExpensesSection from '@apps/waypoint/components/ExpensesSection';
import MembersSection from '@apps/waypoint/components/MembersSection';
import NotificationsIndicator from '@apps/waypoint/components/NotificationsIndicator';
import OverviewSection from '@apps/waypoint/components/OverviewSection';
import SharedAlbumSection from '@apps/waypoint/components/SharedAlbumSection';
import StaysSection from '@apps/waypoint/components/StaysSection';
import TimelineSection from '@apps/waypoint/components/TimelineSection';
import TripBottomNav from '@apps/waypoint/components/TripBottomNav';
import TripProgressBar from '@apps/waypoint/components/TripProgressBar';
import { TRIP_SECTION_TABS, type TripSectionTab } from '@apps/waypoint/constants';
import { createAnnouncement } from '@apps/waypoint/store/actions/announcementActions';
import {
  deleteTrip,
  editTrip,
  setTripArchived,
  type EditTripValues,
} from '@apps/waypoint/store/actions/tripActions';
import { getTripStatus } from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { hasTripRole, isTripAdmin, isTripDateShiftLocked } from '@apps/waypoint/utils/roleGuards';

const { option, custom } = DropdownMenuFactories;

interface TripDetailPageProps {
  trip: TripSpace;
  events: TimelineEvent[];
  currentUserId: string;
  onBack: () => void;
}

type EditingField = 'title' | 'dates' | 'cover' | null;

function TripDetailPage({ trip, events, currentUserId, onBack }: TripDetailPageProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const isSmallScreen = useMediaQuery().isBelow('sm');
  const [searchParams, setSearchParams] = useSearchParams();
  const isActive = getTripStatus(trip, now) === 'ACTIVE';
  const isValidSectionTab = (value: string | null): value is TripSectionTab =>
    value !== null && TRIP_SECTION_TABS.includes(value as TripSectionTab);
  const tabParam = searchParams.get('tab');
  // An active trip opens with nothing expanded — the live HUD above is the
  // point; a non-active trip keeps the old behavior of opening to Timeline.
  // A valid ?tab= in the URL takes priority over that default, so a shared
  // or refreshed link reopens on the same section.
  const [sectionTab, setSectionTabState] = useState(() =>
    isValidSectionTab(tabParam) ? tabParam : isActive ? '' : 'overview',
  );

  // On a phone, an active trip behaves like an app: a bottom bar switches between whole
  // screens (Today is the live HUD) instead of expanding sections beneath it.
  const hasAppNav = isActive && isSmallScreen;

  const setSectionTab = (value: string) => {
    setSectionTabState(value);
    if (hasAppNav) {
      window.scrollTo({ top: 0 });
    }
    const nextSearchParams = new URLSearchParams(searchParams);
    if (isValidSectionTab(value)) {
      nextSearchParams.set('tab', value);
    } else {
      nextSearchParams.delete('tab');
    }
    setSearchParams(nextSearchParams, { replace: true });
  };
  const [dayTab, setDayTab] = useState('all');
  const [isAnnouncementFormOpen, setIsAnnouncementFormOpen] = useState(false);
  const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [isSubmittingTripEdit, setIsSubmittingTripEdit] = useState(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);

  const canEdit = !isTripDateShiftLocked(trip) && hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const isAdmin = isTripAdmin(trip, currentUserId);

  // The trip list -> trip detail transition is a query-param change, not a route change,
  // so the browser doesn't reset scroll position on its own — do it explicitly.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleViewDay = (dayIndex: number) => {
    setSectionTab('overview');
    setDayTab(String(dayIndex));
  };

  const handlePostAnnouncement = async (
    fields: Omit<Parameters<typeof createAnnouncement>[0], 'uid' | 'trip'>,
  ) => {
    setIsSubmittingAnnouncement(true);
    try {
      await dispatch(createAnnouncement({ uid: currentUserId, trip, ...fields })).unwrap();
      setIsAnnouncementFormOpen(false);
    } catch (announcementError) {
      addToast({
        title: 'Unable to post this announcement',
        description: getErrorMessage(announcementError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmittingAnnouncement(false);
    }
  };

  const handleCopyTripLink = async () => {
    const copied = await copyToClipboard(
      `${window.location.origin}/waypoint?trip=${trip.id}`,
    );
    addToast(
      copied
        ? {
            title: 'Trip link copied',
            description: 'Anyone on this trip can use it to jump right in.',
          }
        : {
            title: 'Unable to copy the link',
            description: 'Please try again.',
            type: 'error',
          },
    );
  };

  const handleEditTrip = async (values: EditTripValues) => {
    setIsSubmittingTripEdit(true);
    try {
      await dispatch(editTrip({ uid: currentUserId, trip, values })).unwrap();
      setEditingField(null);
    } catch (editError) {
      addToast({
        title: 'Unable to update this trip',
        description: getErrorMessage(editError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmittingTripEdit(false);
    }
  };

  const handleToggleArchived = async () => {
    setIsMobileActionsOpen(false);
    if (!trip.isArchived) {
      const confirmed = await confirm({
        title: 'Archive trip',
        message:
          'Archive this trip? It will stay available under Show archived and can be restored later.',
      });
      if (!confirmed) {
        return;
      }
    }

    try {
      await dispatch(
        setTripArchived({ uid: currentUserId, trip, isArchived: !trip.isArchived }),
      ).unwrap();
    } catch (archiveError) {
      addToast({
        title: 'Unable to update this trip',
        description: getErrorMessage(archiveError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  const handleDeleteTrip = async () => {
    setIsMobileActionsOpen(false);
    const confirmed = await confirm({
      title: 'Delete trip',
      message: `Delete "${trip.title}"? This removes it for everyone and cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await dispatch(deleteTrip({ uid: currentUserId, trip })).unwrap();
      onBack();
    } catch (deleteError) {
      addToast({
        title: 'Unable to delete this trip',
        description: getErrorMessage(deleteError, 'Please try again.'),
        type: 'error',
      });
    }
  };

  const titleActionItem = canEdit
    ? option({
        label: 'Change title',
        value: 'title',
        icon: <Pencil className='h-4 w-4' />,
        onClick: () => {
          setEditingField('title');
          setIsMobileActionsOpen(false);
        },
      })
    : null;
  const datesActionItem = canEdit
    ? option({
        label: 'Change dates',
        value: 'dates',
        icon: <Calendar className='h-4 w-4' />,
        onClick: () => {
          setEditingField('dates');
          setIsMobileActionsOpen(false);
        },
      })
    : null;
  const coverActionItem = canEdit
    ? option({
        label: 'Set cover photo',
        value: 'cover',
        icon: <Image className='h-4 w-4' />,
        onClick: () => {
          setEditingField('cover');
          setIsMobileActionsOpen(false);
        },
      })
    : null;
  const announcementActionItem = canEdit
    ? option({
        label: 'Post announcement',
        value: 'announcement',
        icon: <Megaphone className='h-4 w-4' />,
        onClick: () => {
          setIsAnnouncementFormOpen(true);
          setIsMobileActionsOpen(false);
        },
      })
    : null;
  const archiveActionItem = isAdmin
    ? option({
        label: trip.isArchived ? 'Unarchive trip' : 'Archive trip',
        value: 'archive',
        icon: trip.isArchived ? (
          <ArchiveRestore className='h-4 w-4' />
        ) : (
          <Archive className='h-4 w-4' />
        ),
        onClick: () => void handleToggleArchived(),
      })
    : null;
  const deleteActionItem = isAdmin
    ? option({
        label: 'Delete trip',
        value: 'delete',
        icon: <Trash2 className='h-4 w-4' />,
        onClick: () => void handleDeleteTrip(),
      })
    : null;
  // The option() factory has no destructive styling hook, so the desktop dropdown's
  // delete entry is rendered as custom content instead — the mobile drawer already
  // applies its own red styling directly from `deleteActionItem` above.
  const deleteDesktopMenuItem = isAdmin
    ? custom(() => (
        <Button
          type='button'
          variant='tertiary'
          className='text-destructive! hover:bg-destructive/10 w-full justify-start gap-2 rounded-none px-3 py-2 text-sm'
          onClick={() => void handleDeleteTrip()}
        >
          <Trash2 className='h-4 w-4' />
          Delete trip
        </Button>
      ))
    : null;

  const actionItems = [announcementActionItem, archiveActionItem, coverActionItem, deleteDesktopMenuItem].filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  const groupedEditActionItems = [titleActionItem, datesActionItem, coverActionItem].filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  const standaloneActionItems = [announcementActionItem, archiveActionItem].filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );

  const moreButtonTrigger = (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-label='Trip actions'
      className='bg-transparent! px-2'
      onClick={isSmallScreen ? () => setIsMobileActionsOpen(true) : undefined}
    >
      <MoreHorizontal className='h-4 w-4' />
    </Button>
  );

  return (
    <div className='page'>
      <div
        className={join(
          'mx-auto max-w-4xl',
          isActive ? 'space-y-2.5 py-3 sm:space-y-6 sm:py-8' : 'space-y-6 py-8',
          hasAppNav && 'pb-24',
        )}
      >
        <div className={join('flex items-center justify-between', isSmallScreen && 'mb-3')}>
          <Button
            type='button'
            variant='link'
            className={join('px-0', (isActive || isSmallScreen) && 'h-auto p-0')}
            aria-label='Back to My Trips'
            onClick={onBack}
          >
            <ChevronLeft className={isSmallScreen ? 'h-6 w-6' : undefined} />
            {!isSmallScreen && 'Back to My Trips'}
          </Button>
          {isSmallScreen && (
            <div className='flex shrink-0 items-center gap-1.5'>
              {isActive && (
                <NotificationsIndicator trip={trip} currentUserId={currentUserId} isSmallScreen />
              )}
              {isActive && (
                <SharedAlbumSection trip={trip} currentUserId={currentUserId} variant='icon' />
              )}
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                aria-label='Copy trip link'
                title='Copy trip link'
                className='bg-transparent! px-2'
                onClick={() => void handleCopyTripLink()}
              >
                <Link className='h-4 w-4' />
              </Button>
              {moreButtonTrigger}
            </div>
          )}
        </div>
        <div>
          {trip.coverImageUrl && (
            <img
              src={trip.coverImageUrl}
              alt={`${trip.title} cover`}
              className={join(
                'mb-4 w-full rounded-lg object-cover',
                // Kept slim on an active trip — the live status below is the point,
                // and every bit of vertical space matters on a mobile screen.
                isActive ? 'h-20 sm:h-48' : 'h-48',
              )}
            />
          )}
          <div className={join('flex flex-wrap items-start justify-between', isActive ? 'gap-2' : 'gap-3')}>
            <div className='w-full min-w-0 sm:w-auto'>
              <div
                className={join(
                  'group flex flex-wrap items-center gap-2',
                  canEdit && !isSmallScreen && 'cursor-pointer',
                )}
                onClick={canEdit && !isSmallScreen ? () => setEditingField('title') : undefined}
              >
                <h1 className={join('font-semibold', isActive ? 'text-2xl' : 'text-3xl')}>
                  {trip.title}
                </h1>
                {canEdit && !isSmallScreen && (
                  <Pencil className='text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100' />
                )}
                {isActive && (
                  <Badge variant='success' use='status'>
                    Active
                  </Badge>
                )}
                {trip.isArchived && <Badge variant='muted'>Archived</Badge>}
              </div>
              <div
                className={join(
                  'group mt-1 flex w-fit items-center gap-1.5',
                  canEdit && !isSmallScreen && 'cursor-pointer',
                )}
                onClick={canEdit && !isSmallScreen ? () => setEditingField('dates') : undefined}
              >
                <p className='text-muted-foreground'>
                  {formatDateUTC(trip.startDate)} - {formatDateUTC(trip.endDate)}
                </p>
                {canEdit && !isSmallScreen && (
                  <Pencil className='text-muted-foreground h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100' />
                )}
              </div>
            </div>
            {!isSmallScreen && (
              <div className='flex shrink-0 items-center gap-1.5 sm:gap-2'>
                {isActive && (
                  <NotificationsIndicator trip={trip} currentUserId={currentUserId} isSmallScreen={false} />
                )}
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  aria-label='Copy trip link'
                  title='Copy trip link'
                  className='bg-transparent! px-2'
                  onClick={() => void handleCopyTripLink()}
                >
                  <Link className='h-4 w-4' />
                </Button>
                <DropdownMenu items={actionItems} trigger={moreButtonTrigger} placement='bottom' alignment='end' />
              </div>
            )}
          </div>
          <div className={join('mt-3', isActive && 'hidden sm:block')}>
            <SharedAlbumSection trip={trip} currentUserId={currentUserId} />
          </div>
        </div>
        {isTripDateShiftLocked(trip) && (
          <div className='bg-warning/15 text-warning border-warning flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm'>
            <LoaderCircle className='h-4 w-4 shrink-0 animate-spin' />
            <span>
              This trip&apos;s dates are being updated — editing is paused until
              it finishes. This can take a minute.
            </span>
          </div>
        )}
        {(!hasAppNav || sectionTab === '') && (
          <div className='mt-4'>
            <OverviewSection trip={trip} currentUserId={currentUserId} onViewDay={handleViewDay} />
          </div>
        )}
        {!hasAppNav && <hr className='border-border mt-4' />}
        <Tabs
          value={sectionTab}
          onValueChange={setSectionTab}
          tabsWidth='full'
          variant='pills'
        >
          {!hasAppNav && (
            <TabsList>
              <TabsTrigger value='overview'>Timeline</TabsTrigger>
              <TabsTrigger value='members'>Members</TabsTrigger>
              <TabsTrigger value='expenses'>Expenses</TabsTrigger>
              <TabsTrigger value='stays'>Stays</TabsTrigger>
              <TabsTrigger value='checklist'>Checklist</TabsTrigger>
            </TabsList>
          )}
          {sectionTab !== '' && !hasAppNav && (
            <div className='mt-4 flex justify-center'>
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0 text-xs'
                onClick={() => setSectionTab('')}
              >
                Collapse view
              </Button>
            </div>
          )}
          <TabsContent value='overview' className='pt-2'>
            <TimelineSection
              trip={trip}
              events={events}
              currentUserId={currentUserId}
              activeDayTab={dayTab}
              onActiveDayTabChange={setDayTab}
            />
          </TabsContent>
          <TabsContent value='members'>
            <MembersSection trip={trip} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value='expenses'>
            <ExpensesSection trip={trip} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value='stays'>
            <StaysSection trip={trip} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value='checklist'>
            <ChecklistSection trip={trip} currentUserId={currentUserId} />
          </TabsContent>
        </Tabs>
      </div>
      {hasAppNav ? (
        <TripBottomNav trip={trip} now={now} value={sectionTab} onChange={setSectionTab} />
      ) : (
        isActive && <TripProgressBar trip={trip} now={now} />
      )}
      <AnnouncementFormModal
        key={isAnnouncementFormOpen ? 'open' : 'closed'}
        isOpen={isAnnouncementFormOpen}
        isSubmitting={isSubmittingAnnouncement}
        onSubmit={handlePostAnnouncement}
        onClose={() => setIsAnnouncementFormOpen(false)}
      />
      <EditTripTitleModal
        key={`title-${editingField === 'title' ? 'open' : 'closed'}`}
        isOpen={editingField === 'title'}
        trip={trip}
        isSubmitting={isSubmittingTripEdit}
        onSubmit={handleEditTrip}
        onClose={() => setEditingField(null)}
      />
      <EditTripDatesModal
        key={`dates-${editingField === 'dates' ? 'open' : 'closed'}`}
        isOpen={editingField === 'dates'}
        trip={trip}
        isSubmitting={isSubmittingTripEdit}
        onSubmit={handleEditTrip}
        onClose={() => setEditingField(null)}
      />
      <EditTripCoverModal
        key={`cover-${editingField === 'cover' ? 'open' : 'closed'}`}
        isOpen={editingField === 'cover'}
        trip={trip}
        isSubmitting={isSubmittingTripEdit}
        onSubmit={handleEditTrip}
        onClose={() => setEditingField(null)}
      />
      <Drawer
        isOpen={isMobileActionsOpen}
        onClose={() => setIsMobileActionsOpen(false)}
        title='Trip actions'
      >
        <div className='space-y-4'>
          {[
            { items: groupedEditActionItems, destructive: false },
            ...standaloneActionItems.map((item) => ({ items: [item], destructive: false })),
            ...(deleteActionItem ? [{ items: [deleteActionItem], destructive: true }] : []),
          ].map(
            ({ items: groupItems, destructive }) =>
              groupItems.length > 0 && (
                <div key={groupItems[0].value} className='bg-muted/50 overflow-hidden rounded-lg'>
                  {groupItems.map((item) => (
                    <Button
                      key={item.value}
                      type='button'
                      variant='tertiary'
                      className={join(
                        'w-full justify-start gap-3 rounded-none px-3 py-2.5',
                        destructive && 'text-destructive! hover:text-destructive!',
                      )}
                      onClick={item.onClick}
                    >
                      {item.icon}
                      {item.label}
                    </Button>
                  ))}
                </div>
              ),
          )}
        </div>
      </Drawer>
    </div>
  );
}

export default TripDetailPage;
