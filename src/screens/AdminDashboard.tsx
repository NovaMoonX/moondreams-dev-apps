import {
  Button,
  Input,
  Modal,
  Textarea,
  Toggle,
} from '@moondreamsdev/dreamer-ui/components';
import { collection, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import NavButton from '@/ui/NavButton';
import UserAvatar from '@/ui/UserAvatar';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { ADMIN_EMAIL, getUnconfiguredRegistryApps } from '@lib/app';
import { db } from '@lib/firebase/config';
import type { AppMetadata, UserProfile } from '@lib/types/appCatalog';
import { X } from '@moondreamsdev/dreamer-ui/symbols';

type AppConfigEditorProps = {
  app: AppMetadata;
  users: UserProfile[];
  onDirtyChange?: (appId: string, isDirty: boolean) => void;
  onSave: (appId: string, payload: Partial<AppMetadata>) => Promise<void>;
};

function AppConfigEditor({
  app,
  users,
  onDirtyChange,
  onSave,
}: AppConfigEditorProps) {
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description ?? '');
  const [isRestricted, setIsRestricted] = useState(app.isRestricted ?? false);
  const [allowedUsers, setAllowedUsers] = useState<string[]>(
    app.allowedUsers ?? [],
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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
  const hasNoSearchResults =
    trimmedSearchTerm.length > 0 && availableUsers.length === 0;

  const hasUnsavedChanges = useMemo(() => {
    const savedAllowedUsers = [...app.allowedUsers].sort((a, b) =>
      a.localeCompare(b),
    );
    const nextAllowedUsers = [...allowedUsers].sort((a, b) =>
      a.localeCompare(b),
    );

    return (
      name.trim() !== app.name.trim() ||
      description.trim() !== (app.description ?? '').trim() ||
      isRestricted !== app.isRestricted ||
      savedAllowedUsers.length !== nextAllowedUsers.length ||
      savedAllowedUsers.some(
        (value, index) => value !== nextAllowedUsers[index],
      )
    );
  }, [allowedUsers, app, description, isRestricted, name]);

  useEffect(() => {
    onDirtyChange?.(app.id, hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange, app.id]);

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

  const saveChanges = async () => {
    setIsSaving(true);

    try {
      await onSave(app.id, {
        name,
        description,
        isRestricted,
        allowedUsers,
      });
      onDirtyChange?.(app.id, false);
    } catch (error) {
      console.error('Failed to save app metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className='border-border bg-card space-y-6 rounded-2xl border p-5'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <p className='text-foreground/60 text-[10px] font-medium tracking-[0.2em] uppercase'>
            App settings
          </p>
          <h2 className='text-foreground mt-1 text-2xl font-semibold'>
            {app.name}
          </h2>
        </div>
        <Button onClick={saveChanges} disabled={isSaving || !hasUnsavedChanges}>
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
        <label className='text-foreground text-sm font-medium'>
          Description
        </label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </div>

      <div className='border-border bg-muted/30 flex items-center justify-between rounded-xl border px-3 py-2'>
        <div>
          <div className='text-foreground text-sm font-medium'>
            Restrict access
          </div>
          <div className='text-muted-foreground text-xs'>
            Limit the app to specific users or emails.
          </div>
        </div>
        <Toggle checked={isRestricted} onCheckedChange={setIsRestricted} />
      </div>

      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <label className='text-foreground text-sm font-medium'>
            Approved users
          </label>
          <Button
            variant='destructive'
            onClick={() => setIsDeleteModalOpen(true)}
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

        <div className='border-border bg-muted/20 rounded-xl border p-3'>
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
            <div className='mb-3 flex items-center justify-between gap-2 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/5 p-2'>
              <span className='text-xs text-amber-700'>
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

          <div className='space-y-2'>
            {availableUsers.length === 0 && !hasNoSearchResults ? (
              <span className='text-muted-foreground text-sm'>
                No matching users found.
              </span>
            ) : (
              availableUsers.map((profile) => (
                <div
                  key={profile.uid}
                  className='border-border flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5'
                >
                  <div className='flex items-center gap-2'>
                    <UserAvatar user={profile} size='sm' />
                    <div>
                      <div className='text-foreground text-sm'>
                        {profile.displayName ?? profile.email}
                      </div>
                      <div className='text-muted-foreground text-xs'>
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
        </div>
      </div>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title='Clear access list'
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onClick: () => setIsDeleteModalOpen(false),
          },
          {
            label: 'Clear',
            variant: 'destructive',
            onClick: () => {
              setAllowedUsers([]);
              setIsDeleteModalOpen(false);
            },
          },
        ]}
      >
        <p className='text-muted-foreground text-sm'>
          This will remove all current user restrictions from this app.
        </p>
      </Modal>
    </main>
  );
}

function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const { allApps, updateAppMetadata } = useAppCatalog();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('worth-the-wait');
  const [dirtyAppIds, setDirtyAppIds] = useState<string[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const allUsers = snapshot.docs.map((docSnap) => ({
        uid: docSnap.id,
        ...(docSnap.data() as Partial<UserProfile>),
      })) as UserProfile[];
      const nextUsers = allUsers
        .filter((user) => user.email !== ADMIN_EMAIL)
        .sort((a, b) => a.email.localeCompare(b.email));
      setUsers(nextUsers);
    });

    return () => unsub();
  }, []);

  const unconfiguredApps = useMemo(
    () => getUnconfiguredRegistryApps(allApps),
    [allApps],
  );

  const selectedApp = useMemo(
    () => allApps.find((app) => app.id === selectedAppId) ?? allApps[0],
    [allApps, selectedAppId],
  );

  const handleSelectApp = (nextAppId: string) => {
    const nextApp = allApps.find((app) => app.id === nextAppId) ?? allApps[0];
    if (!nextApp) {
      return;
    }

    setSelectedAppId(nextApp.id);
  };

  const handleDirtyChange = useCallback((appId: string, isDirty: boolean) => {
    setDirtyAppIds((current) => {
      const next = new Set(current);
      if (isDirty) {
        next.add(appId);
      } else {
        next.delete(appId);
      }
      return Array.from(next);
    });
  }, []);

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className='page pt-20'>
      <div className='mx-auto w-full max-w-5xl space-y-6'>
        <header className='flex items-center justify-between gap-4'>
          <div>
            <p className='text-foreground/60 text-xs font-medium tracking-[0.24em] uppercase'>
              Admin
            </p>
            <h1 className='text-foreground mt-2 text-4xl font-semibold tracking-tight'>
              Dashboard
            </h1>
            <p className='text-muted-foreground mt-1 text-sm'>{ADMIN_EMAIL}</p>
          </div>
          <div className='flex gap-2'>
            <NavButton href='/' variant='outline'>
              Back
            </NavButton>
          </div>
        </header>

        <div className='grid gap-6 lg:grid-cols-[260px_1fr]'>
          <aside className='border-border bg-card rounded-2xl border p-4'>
            <h2 className='text-foreground text-sm font-medium'>Apps</h2>
            {unconfiguredApps.length > 0 ? (
              <div className='mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2'>
                <div className='text-xs font-medium tracking-[0.2em] text-amber-600 uppercase'>
                  Needs setup
                </div>
                <div className='mt-2 space-y-2'>
                  {unconfiguredApps.map((app) => (
                    <button
                      key={app.id}
                      type='button'
                      onClick={() => handleSelectApp(app.id)}
                      className='text-foreground/80 w-full rounded-lg border border-dashed border-amber-500/60 bg-transparent px-2 py-2 text-left text-xs hover:bg-amber-500/5'
                    >
                      {app.id}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className='mt-3 space-y-2'>
              {allApps.map((app) => {
                const isDirty = dirtyAppIds.includes(app.id);

                return (
                  <button
                    key={app.id}
                    type='button'
                    onClick={() => handleSelectApp(app.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      selectedApp?.id === app.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-foreground/70 hover:bg-muted/40 bg-transparent'
                    }`}
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <div className='text-sm font-medium'>
                        {app.name || app.id}
                      </div>
                      {isDirty ? (
                        <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium tracking-[0.12em] text-amber-600 uppercase'>
                          Changed
                        </span>
                      ) : null}
                    </div>
                    <div className='mt-1 text-xs opacity-70'>
                      /{app.path.replace(/^\//, '') || app.id}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedApp ? (
            <AppConfigEditor
              key={selectedApp.id}
              app={selectedApp}
              users={users}
              onDirtyChange={handleDirtyChange}
              onSave={updateAppMetadata}
            />
          ) : (
            <p className='text-muted-foreground text-sm'>No app selected.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
