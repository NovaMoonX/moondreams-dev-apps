import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AppToggle from '@/components/AppToggle';
import BackLink from '@/components/BackLink';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import SettingsGroup from '@/components/SettingsGroup';
import SettingsRow from '@/components/SettingsRow';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDate } from '@/utils/formatUtils';
import { MAX_PERSON_NAME_LENGTH } from '@apps/a-list/constants';
import {
  removeSharedCalendar,
  renameSharedPerson,
  setSharedPersonShown,
} from '@apps/a-list/store/actions/addedCalendarActions';
import { selectSharedPeople } from '@apps/a-list/store/selectors';
import {
  toPersonKey,
  type SharedPerson,
} from '@apps/a-list/utils/friendShowings';
import { formatShareRange } from '@apps/a-list/utils/sharing';

type SharedLink = SharedPerson['links'][number];

function getLinkLabel({ calendar, feedState }: SharedLink) {
  if (calendar.kind === 'LIVE') return 'Live link';
  if (feedState.status !== 'ok') return 'Snapshot';
  const { startDate, endDate } = feedState.feed;
  if (startDate === null || endDate === null) return 'Snapshot';
  return `Snapshot of ${formatShareRange(startDate, endDate)}`;
}

function getLinksSummary(person: SharedPerson) {
  const liveCount = person.links.filter(
    ({ calendar }) => calendar.kind === 'LIVE',
  ).length;
  const snapshots = person.links.filter(
    ({ calendar }) => calendar.kind !== 'LIVE',
  );
  if (liveCount > 0 && snapshots.length === 0) return 'Live';
  if (liveCount === 0) {
    return snapshots.length === 1
      ? getLinkLabel(snapshots[0])
      : `${snapshots.length} snapshots`;
  }
  return snapshots.length === 1
    ? 'Live and a snapshot'
    : `Live and ${snapshots.length} snapshots`;
}

function getPersonSummary(person: SharedPerson) {
  return [
    getLinksSummary(person),
    person.isShown ? null : 'Hidden from your calendar',
    person.hasEnded ? 'A link has ended' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

interface PersonViewProps {
  uid: string;
  person: SharedPerson;
  otherNames: string[];
  onBack: () => void;
}

function PersonView({ uid, person, otherNames, onBack }: PersonViewProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const [name, setName] = useState(person.personName);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isSavingShown, setIsSavingShown] = useState(false);
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const isTaken = otherNames.some(
    (other) => toPersonKey(other) === toPersonKey(trimmed),
  );
  const error =
    saveError ??
    (isTaken && trimmed !== ''
      ? `${trimmed} is already on your calendar.`
      : null);
  const isChanged = trimmed !== person.personName;

  const rename = async () => {
    setIsRenaming(true);
    setSaveError(null);
    try {
      await dispatch(
        renameSharedPerson({
          uid,
          calendarIds: person.links.map(({ calendar }) => calendar.id),
          personName: trimmed,
          otherNames,
        }),
      ).unwrap();
    } catch (renameError) {
      setSaveError(
        typeof renameError === 'string' ? renameError : 'Unable to rename.',
      );
    }
    setIsRenaming(false);
  };

  const setShown = async (isShown: boolean) => {
    setIsSavingShown(true);
    try {
      await dispatch(
        setSharedPersonShown({
          uid,
          calendarIds: person.links.map(({ calendar }) => calendar.id),
          isShown,
        }),
      ).unwrap();
    } catch {
      addToast({
        title: 'That didn’t save',
        description: 'Check your connection and try again.',
        type: 'error',
      });
    }
    setIsSavingShown(false);
  };

  const remove = async (link: SharedLink) => {
    const label = getLinkLabel(link);
    const confirmed = await confirm({
      title: 'Remove link',
      message: `Remove the ${label.charAt(0).toLowerCase()}${label.slice(1)} from ${person.personName}? Their showings from it leave your calendar.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;

    setRemovingId(link.calendar.id);
    try {
      await dispatch(
        removeSharedCalendar({ uid, shareId: link.calendar.id }),
      ).unwrap();
    } catch {
      addToast({
        title: 'That didn’t go through',
        description: 'Check your connection and try again.',
        type: 'error',
      });
    }
    setRemovingId(null);
  };

  return (
    <div className='space-y-4 pb-4'>
      <BackLink onBack={onBack} label='Back to friends' />
      <SettingsGroup title='Your calendar'>
        <SettingsRow
          icon='📅'
          title='Show on my calendar'
          description={
            person.isShown
              ? undefined
              : 'Hidden. Their links stay here for when you want them back.'
          }
          control={
            <AppToggle
              aria-label={`Show ${person.personName} on my calendar`}
              checked={person.isShown}
              disabled={isSavingShown}
              onCheckedChange={(isShown) => void setShown(isShown)}
            />
          }
        />
      </SettingsGroup>
      <div className='space-y-1.5'>
        <p className='text-sm font-medium'>Name</p>
        <div className='flex items-start gap-2'>
          <div className='min-w-0 flex-1 space-y-1'>
            <Input
              variant='outline'
              rounded='full'
              className='h-10'
              aria-label='Friend’s name'
              maxLength={MAX_PERSON_NAME_LENGTH}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaveError(null);
              }}
            />
            {error && (
              <p className='text-destructive px-2 text-sm' role='alert'>
                {error}
              </p>
            )}
          </div>
          <Button
            type='button'
            rounded='full'
            loading={isRenaming}
            disabled={!isChanged || trimmed === '' || isTaken || isRenaming}
            onClick={() => void rename()}
          >
            Save
          </Button>
        </div>
      </div>
      <SettingsGroup title='Links'>
        {person.links.map((link) => (
          <li key={link.calendar.id} className='flex items-start gap-3 py-3'>
            <span
              className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-lg leading-none'
              aria-hidden='true'
            >
              {link.calendar.kind === 'LIVE' ? '📡' : '📸'}
            </span>
            <span className='flex min-h-10 min-w-0 flex-1 flex-col justify-center'>
              <span className='text-foreground font-medium text-pretty'>
                {getLinkLabel(link)}
              </span>
              <span className='text-muted-foreground text-sm text-pretty'>
                {link.feedState.status === 'ended'
                  ? 'This link was deleted or its PIN changed'
                  : `Added ${formatDate(link.calendar.createdAt)}`}
              </span>
            </span>
            <span className='flex h-10 shrink-0 items-center'>
              <DeleteIconButton
                label={`Remove ${getLinkLabel(link)}`}
                disabled={removingId === link.calendar.id}
                onClick={() => void remove(link)}
              />
            </span>
          </li>
        ))}
      </SettingsGroup>
    </div>
  );
}

interface FriendsCalendarsSheetProps {
  uid: string;
  onClose: () => void;
}

/** The people whose calendars the member added, each opening their own view with the show switch, rename and remove. */
export function FriendsCalendarsSheet({
  uid,
  onClose,
}: FriendsCalendarsSheetProps) {
  const people = useAppSelector(selectSharedPeople);
  const [openCalendarId, setOpenCalendarId] = useState<string | null>(null);
  const openPerson =
    openCalendarId === null
      ? null
      : (people.find((person) =>
          person.links.some(({ calendar }) => calendar.id === openCalendarId),
        ) ?? null);

  return (
    <FormSheet
      isOpen
      isDrawerWhenShort
      title='Friends’ calendars'
      onClose={onClose}
      viewKey={
        openPerson ? `person-${openPerson.links[0].calendar.id}` : 'list'
      }
    >
      {openPerson ? (
        <PersonView
          key={openPerson.links[0].calendar.id}
          uid={uid}
          person={openPerson}
          otherNames={people
            .filter((person) => person !== openPerson)
            .map((person) => person.personName)}
          onBack={() => setOpenCalendarId(null)}
        />
      ) : (
        <div className='space-y-3 pb-4'>
          {people.length === 0 ? (
            <p className='text-muted-foreground py-2 text-center text-sm text-pretty'>
              <span aria-hidden='true'>👯 </span>
              When a friend sends you their A-List link, open it and tap Add.
            </p>
          ) : (
            <SettingsGroup title='Shared with you'>
              {people.map((person) => (
                <SettingsRow
                  key={toPersonKey(person.personName)}
                  icon={person.personName.charAt(0).toUpperCase()}
                  title={person.personName}
                  description={getPersonSummary(person)}
                  hasChevron
                  onClick={() => setOpenCalendarId(person.links[0].calendar.id)}
                />
              ))}
            </SettingsGroup>
          )}
          {people.length > 0 && (
            <p className='text-muted-foreground px-1 text-sm text-pretty'>
              Tap a friend to hide them from your calendar, rename them or
              remove a link.
            </p>
          )}
        </div>
      )}
    </FormSheet>
  );
}
