import {
  Button,
  Input,
  Select,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from '@moondreamsdev/dreamer-ui/symbols';
import { useMemo, useState } from 'react';

import AppToggle from '@/components/AppToggle';
import UserAvatar from '@/ui/UserAvatar';
import {
  APP_STATUS_OPTIONS,
  type AppMetadata,
  type AppStatus,
  type UserProfile,
} from '@lib/types/appCatalog';

import { type AppDraft } from './appDraft';
import { AVAILABLE_USERS_PREVIEW } from './constants';

interface AppSettingsTabProps {
  app: AppMetadata;
  draft: AppDraft;
  isDirty: boolean;
  users: UserProfile[];
  onDraftChange: (patch: Partial<AppDraft>) => void;
  onSave: (appId: string, payload: Partial<AppMetadata>) => Promise<void>;
  onSaved: () => void;
}

function AppSettingsTab({ app, draft, isDirty, users, onDraftChange, onSave, onSaved }: AppSettingsTabProps) {
  const { name, description, status, isRestricted, allowedUsers } = draft;
  const setName = (value: string) => onDraftChange({ name: value });
  const setDescription = (value: string) => onDraftChange({ description: value });
  const setStatus = (value: AppStatus) => onDraftChange({ status: value });
  const setIsRestricted = (value: boolean) => onDraftChange({ isRestricted: value });
  const setAllowedUsers = (next: string[] | ((current: string[]) => string[])) =>
    onDraftChange({ allowedUsers: typeof next === 'function' ? next(allowedUsers) : next });
  const [searchTerm, setSearchTerm] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { confirm } = useActionModal();

  const approvedUsers = useMemo(
    () =>
      allowedUsers
        .map((value) => {
          const profile = users.find(
            (candidate) =>
              candidate.uid === value ||
              candidate.email?.toLowerCase() === value.trim().toLowerCase(),
          );

          if (!profile) {
            return {
              key: value,
              displayName: value,
              photoURL: undefined,
              email: value,
            };
          }

          return {
            key: profile.uid || value,
            displayName: profile.displayName ?? profile.email ?? value,
            photoURL: profile.photoURL,
            email: profile.email ?? value,
          };
        })
        .filter(Boolean),
    [allowedUsers, users],
  );

  const availableUsers = useMemo(
    () =>
      users.filter((profile) => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const matchesSearch =
          normalizedSearch.length === 0 ||
          profile.displayName?.toLowerCase().includes(normalizedSearch) ||
          profile.email?.toLowerCase().includes(normalizedSearch) ||
          profile.uid.toLowerCase().includes(normalizedSearch);

        const isGranted = allowedUsers.some(
          (value) =>
            value.toLowerCase() === profile.uid.toLowerCase() ||
            value.toLowerCase() === profile.email?.toLowerCase(),
        );

        return matchesSearch && !isGranted;
      }),
    [allowedUsers, searchTerm, users],
  );

  const trimmedSearchTerm = searchTerm.trim();
  const shownUsers = trimmedSearchTerm ? availableUsers : availableUsers.slice(0, AVAILABLE_USERS_PREVIEW);
  const hasNoSearchResults =
    trimmedSearchTerm.length > 0 && availableUsers.length === 0;

  const addUserToAccessList = (value: string) => {
    if (!isRestricted) {
      return;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }

    setAllowedUsers((current) => {
      const uniqueValues = new Set([...current, trimmedValue]);
      return Array.from(uniqueValues);
    });
  };

  const addSearchTermToAccessList = () => {
    if (!isRestricted) {
      return;
    }

    const trimmedValue = searchTerm.trim();

    if (!trimmedValue) {
      setSearchError('Enter an email address to add.');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedValue)) {
      setSearchError('Enter a valid email address.');
      return;
    }

    const normalizedValue = trimmedValue.toLowerCase();
    const alreadyExists = allowedUsers.some(
      (value) => value.trim().toLowerCase() === normalizedValue,
    );

    if (alreadyExists) {
      setSearchTerm('');
      setSearchError('');
      return;
    }

    setAllowedUsers((current) => [...current, trimmedValue]);
    setSearchTerm('');
    setSearchError('');
  };

  const removeUserFromAccessList = (value: string) => {
    if (!isRestricted) {
      return;
    }

    setAllowedUsers((current) => current.filter((entry) => entry !== value));
  };

  const clearList = async () => {
    const confirmed = await confirm({
      title: 'Clear access list',
      message: 'This removes every approved user from this app.',
      confirmText: 'Clear',
      destructive: true,
    });
    if (confirmed) {
      setAllowedUsers([]);
    }
  };

  const saveChanges = async () => {
    setIsSaving(true);

    try {
      await onSave(app.id, draft);
      onSaved();
    } catch (error) {
      console.error('Failed to save app metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between gap-3'>
        <p role='status' className='text-muted-foreground min-w-0 text-sm'>
          {isDirty ? 'You have unsaved changes.' : 'Everything is saved.'}
        </p>
        <Button onClick={saveChanges} disabled={isSaving || !isDirty}>
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <div className='space-y-2'>
          <label className='text-foreground text-sm font-medium'>
            App name
          </label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className='space-y-2'>
          <label className='text-foreground text-sm font-medium'>Path</label>
          <Input value={app.path} disabled />
        </div>
      </div>

      <div className='space-y-2'>
        <label className='text-foreground text-sm font-medium'>Status</label>
        <Select
          options={APP_STATUS_OPTIONS.map((option) => ({
            text:
              option === 'draft'
                ? 'Draft / In progress'
                : option === 'public'
                  ? 'Public / Ready'
                  : 'Removed / Archived',
            value: option,
          }))}
          value={status}
          onChange={(nextStatus) => setStatus(nextStatus as AppStatus)}
        />
      </div>

      <div className='space-y-2'>
        <label className='text-foreground text-sm font-medium'>
          Description
        </label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </div>

      <div className='flex items-center justify-between gap-3'>
        <div>
          <div className='text-foreground text-sm font-medium'>
            Restrict access
          </div>
          <div className='text-muted-foreground text-xs'>
            Limit the app to specific users or emails.
          </div>
        </div>
        <AppToggle checked={isRestricted} onCheckedChange={setIsRestricted} />
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <label className='text-foreground text-sm font-medium'>
            Approved users
          </label>
          <Button
            variant='destructive'
            onClick={clearList}
            disabled={!isRestricted}
          >
            Clear list
          </Button>
        </div>

        <div className='flex flex-wrap gap-2'>
          {approvedUsers.length === 0 ? (
            <span className='text-muted-foreground text-sm'>
              No restricted users yet.
            </span>
          ) : (
            approvedUsers.map((profile) => (
              <div
                key={profile.key}
                className='border-border bg-muted/40 text-foreground flex items-center gap-2 rounded-full border px-2.5 py-1.5'
              >
                <UserAvatar user={profile} size='xs' />
                <span>{profile.displayName}</span>
                <Button
                  size='icon'
                  className='rounded-full!'
                  onClick={() => removeUserFromAccessList(profile.key)}
                  disabled={!isRestricted}
                >
                  <X className='h-3 w-3' />
                </Button>
              </div>
            ))
          )}
        </div>

        <div>
          <div className='text-foreground mb-2 text-sm font-medium'>
            Available users
          </div>
          <div className='mb-3'>
            <Input
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
                  addSearchTermToAccessList();
                }
              }}
              placeholder={
                hasNoSearchResults
                  ? 'No match — add this email'
                  : 'Search users by name or email'
              }
              disabled={!isRestricted}
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
                onClick={addSearchTermToAccessList}
                disabled={!isRestricted}
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
                    onClick={() => addUserToAccessList(profile.uid)}
                    disabled={!isRestricted}
                  >
                    Grant
                  </Button>
                </div>
              ))
            )}
          </div>
          {shownUsers.length < availableUsers.length ? (
            <p className='text-muted-foreground pt-2 text-xs'>
              Showing {shownUsers.length} of {availableUsers.length}. Search to find the rest.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default AppSettingsTab;
