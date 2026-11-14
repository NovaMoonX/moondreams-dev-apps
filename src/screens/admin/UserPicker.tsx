import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useState } from 'react';

import UserAvatar from '@/ui/UserAvatar';
import type { UserProfile } from '@lib/types/appCatalog';

import { AVAILABLE_USERS_PREVIEW, DISABLED_CLASS } from './constants';

interface UserPickerProps {
  users: UserProfile[];
  /** Uids or emails already chosen; those users are left out and a typed email in it counts as added. */
  takenValues: string[];
  isDisabled?: boolean;
  /** Label on each user's button. */
  pickLabel: string;
  onPickUser: (profile: UserProfile) => void;
  onAddEmail: (email: string) => void;
  /** Said under the search once, for what an email with no account does. */
  emailHint?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Search current users by name or email and pick one, or add a free email when nobody matches. */
function UserPicker({
  users,
  takenValues,
  isDisabled = false,
  pickLabel,
  onPickUser,
  onAddEmail,
  emailHint,
}: UserPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchError, setSearchError] = useState('');

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const availableUsers = users.filter((profile) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      profile.displayName?.toLowerCase().includes(normalizedSearch) ||
      profile.email?.toLowerCase().includes(normalizedSearch) ||
      profile.uid.toLowerCase().includes(normalizedSearch);

    const isTaken = takenValues.some(
      (value) =>
        value.toLowerCase() === profile.uid.toLowerCase() ||
        value.toLowerCase() === profile.email?.toLowerCase(),
    );

    return matchesSearch && !isTaken;
  });

  const trimmedSearchTerm = searchTerm.trim();
  const shownUsers = trimmedSearchTerm
    ? availableUsers
    : availableUsers.slice(0, AVAILABLE_USERS_PREVIEW);
  const hasNoSearchResults =
    trimmedSearchTerm.length > 0 && availableUsers.length === 0;

  const addSearchTerm = () => {
    if (isDisabled) {
      return;
    }

    if (!trimmedSearchTerm) {
      setSearchError('Enter an email address to add.');
      return;
    }

    if (!EMAIL_PATTERN.test(trimmedSearchTerm)) {
      setSearchError('Enter a valid email address.');
      return;
    }

    const normalizedValue = trimmedSearchTerm.toLowerCase();
    const alreadyExists = takenValues.some(
      (value) => value.trim().toLowerCase() === normalizedValue,
    );

    if (!alreadyExists) {
      onAddEmail(trimmedSearchTerm);
    }
    setSearchTerm('');
    setSearchError('');
  };

  return (
    <div>
      <div className='text-foreground mb-2 text-sm font-medium'>
        Available users
      </div>
      <div className='mb-3'>
        <Input
          className='placeholder:text-muted-foreground disabled:placeholder:text-muted-foreground disabled:opacity-100'
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value);
            if (searchError) {
              setSearchError('');
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && hasNoSearchResults) {
              event.preventDefault();
              addSearchTerm();
            }
          }}
          placeholder={
            hasNoSearchResults
              ? 'No match — add this email'
              : 'Search users by name or email'
          }
          disabled={isDisabled}
        />
      </div>

      {hasNoSearchResults ? (
        <div className='border-border mb-3 flex items-center justify-between gap-2 rounded-lg border border-dashed p-2'>
          <span className='text-muted-foreground text-xs'>
            No matching users found. Add this email instead.
          </span>
          <Button
            variant='secondary'
            size='sm'
            onClick={addSearchTerm}
            disabled={isDisabled}
          >
            Add email
          </Button>
        </div>
      ) : null}

      {searchError ? (
        <p className='text-destructive mb-3 text-xs'>{searchError}</p>
      ) : null}

      <div className='divide-border divide-y'>
        {availableUsers.length === 0 && !hasNoSearchResults ? (
          <span className='text-muted-foreground text-sm'>
            No matching users found.
          </span>
        ) : (
          shownUsers.map((profile) => (
            <div
              key={profile.uid}
              className='flex items-center justify-between gap-3 py-2'
            >
              <div className='flex min-w-0 items-center gap-3'>
                <UserAvatar user={profile} size='sm' />
                <div className='min-w-0'>
                  <div className='text-foreground truncate text-sm'>
                    {profile.displayName ?? profile.email}
                  </div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {profile.email}
                  </div>
                </div>
              </div>
              <Button
                variant='secondary'
                size='sm'
                className={DISABLED_CLASS}
                onClick={() => onPickUser(profile)}
                disabled={isDisabled}
              >
                {pickLabel}
              </Button>
            </div>
          ))
        )}
      </div>
      {shownUsers.length < availableUsers.length ? (
        <p className='text-muted-foreground pt-2 text-xs'>
          Showing {shownUsers.length} of {availableUsers.length}. Search to find
          the rest.
        </p>
      ) : null}
      {emailHint ? (
        <p className='text-muted-foreground pt-2 text-xs'>{emailHint}</p>
      ) : null}
    </div>
  );
}

export default UserPicker;
