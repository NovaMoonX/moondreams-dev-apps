import {
  Badge,
  Button,
  Input,
  Modal,
  Select,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useQueries, useQuery } from '@tanstack/react-query';
import { collection, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import AppToggle from '@/components/AppToggle';
import HelpTip from '@/components/HelpTip';
import { PillGroup } from '@/components/PillGroup';
import SearchInput from '@/components/SearchInput';
import StatTile from '@/components/StatTile';
import useNow from '@/hooks/useNow';
import { formatDate } from '@/utils/formatUtils';
import NavButton from '@/ui/NavButton';
import UserAvatar from '@/ui/UserAvatar';
import { useAppCatalog } from '@hooks/useAppCatalog';
import { useAuth } from '@hooks/useAuth';
import { ADMIN_EMAIL, getUnconfiguredRegistryApps } from '@lib/app';
import { ACTIVE_WINDOW_MONTHS, getActiveSince } from '@lib/appUsage/appUsage';
import { appUsageQueryOptions } from '@lib/appUsage/appUsageQueries';
import { db } from '@lib/firebase/config';
import {
  APP_STATUS_OPTIONS,
  normalizeAppStatus,
  type AppMetadata,
  type AppStatus,
  type UserProfile,
} from '@lib/types/appCatalog';
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
  const [status, setStatus] = useState<AppStatus>(
    normalizeAppStatus(app.status ?? 'draft'),
  );
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
      status !== app.status ||
      isRestricted !== app.isRestricted ||
      savedAllowedUsers.length !== nextAllowedUsers.length ||
      savedAllowedUsers.some(
        (value, index) => value !== nextAllowedUsers[index],
      )
    );
  }, [allowedUsers, app, description, isRestricted, name, status]);

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
        status,
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

      <div className='border-border bg-muted/30 flex items-center justify-between rounded-xl border px-3 py-2'>
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

type UsageFilter = 'started' | 'active';

type AdminView = 'apps' | 'users';

function AppUsageSection({ app, users }: { app: AppMetadata; users: UserProfile[] }) {
  const [filter, setFilter] = useState<UsageFilter>('started');
  const now = useNow(60_000);
  const { data: usage, isPending, isError } = useQuery(appUsageQueryOptions(app.id));

  const activeSince = getActiveSince(now);
  const rows = (usage ?? []).flatMap((entry) => {
    const profile = users.find((candidate) => candidate.uid === entry.uid);
    return profile
      ? [{ ...entry, profile, isActive: entry.lastActiveAt >= activeSince }]
      : [];
  });
  const startedRows = [...rows].sort((a, b) => b.startedAt - a.startedAt);
  const activeRows = rows
    .filter((row) => row.isActive)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const visibleRows = filter === 'active' ? activeRows : startedRows;

  const getEmptyMessage = () => {
    if (isPending) return 'Loading…';
    if (isError) return "We couldn't load usage just now.";
    if (filter === 'active') return `Nobody has opened ${app.name} in the past ${ACTIVE_WINDOW_MONTHS} months.`;
    return `Nobody has opened ${app.name} yet. People appear here the next time they open it.`;
  };

  return (
    <section className='space-y-4'>
      <div>
        <p className='text-foreground/60 text-[10px] font-medium tracking-[0.2em] uppercase'>
          Usage
        </p>
        <h2 className='text-foreground mt-1 text-2xl font-semibold'>{app.name}</h2>
      </div>

      <div className='grid grid-cols-2 gap-3'>
        <StatTile label='Started using' value={startedRows.length} />
        <StatTile
          label='Active'
          value={activeRows.length}
          help={
            <HelpTip title='Active users'>
              Members who opened {app.name} in the past {ACTIVE_WINDOW_MONTHS} months. Everyone who has ever opened it counts as having started using it.
            </HelpTip>
          }
        />
      </div>

      <PillGroup<UsageFilter>
        label='Show members'
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'started', label: `Started using · ${startedRows.length}` },
          { value: 'active', label: `Active · ${activeRows.length}` },
        ]}
      />

      {visibleRows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{getEmptyMessage()}</p>
      ) : (
        <ul className='divide-border divide-y'>
          {visibleRows.map((row) => (
            <li key={row.uid} className='flex items-center gap-3 py-2.5'>
              <UserAvatar user={row.profile} size='sm' />
              <div className='min-w-0 flex-1'>
                <div className='text-foreground flex items-center gap-2 text-sm'>
                  <span className='truncate'>{row.profile.displayName ?? row.profile.email}</span>
                  {row.isActive ? (
                    <Badge variant='secondary' size='sm'>
                      Active
                    </Badge>
                  ) : null}
                </div>
                <div className='text-muted-foreground truncate text-xs'>{row.profile.email}</div>
              </div>
              <div className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                <div>Started {formatDate(row.startedAt)}</div>
                <div>Last active {formatDate(row.lastActiveAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AllUsersView({ apps, users }: { apps: AppMetadata[]; users: UserProfile[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const now = useNow(60_000);
  const usageQueries = useQueries({ queries: apps.map((app) => appUsageQueryOptions(app.id)) });

  const activeSince = getActiveSince(now);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const rows = users
    .filter(
      (profile) =>
        normalizedSearch.length === 0 ||
        profile.displayName?.toLowerCase().includes(normalizedSearch) ||
        profile.email.toLowerCase().includes(normalizedSearch),
    )
    .map((profile) => ({
      profile,
      lastVisitedAt: profile.lastVisitedAt ?? null,
      appUsage: apps.flatMap((app, index) => {
        const entry = usageQueries[index]?.data?.find((usage) => usage.uid === profile.uid);
        return entry ? [{ app, isActive: entry.lastActiveAt >= activeSince }] : [];
      }),
    }))
    .sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0));

  return (
    <section className='space-y-4'>
      <div>
        <p className='text-foreground/60 text-[10px] font-medium tracking-[0.2em] uppercase'>
          Everyone
        </p>
        <h2 className='text-foreground mt-1 text-2xl font-semibold'>
          {users.length} {users.length === 1 ? 'member' : 'members'}
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          Most recent visitors first. Apps in color were opened in the past {ACTIVE_WINDOW_MONTHS} months.
        </p>
      </div>

      <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder='Search members by name or email' />

      {rows.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {users.length === 0 ? 'No one has signed in yet.' : 'No members match that search.'}
        </p>
      ) : (
        <ul className='divide-border divide-y'>
          {rows.map((row) => (
            <li key={row.profile.uid} className='flex items-start gap-3 py-3'>
              <UserAvatar user={row.profile} size='sm' />
              <div className='min-w-0 flex-1'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='text-foreground truncate text-sm'>
                      {row.profile.displayName ?? row.profile.email}
                    </div>
                    <div className='text-muted-foreground truncate text-xs'>{row.profile.email}</div>
                  </div>
                  <div className='text-muted-foreground shrink-0 text-right text-xs whitespace-nowrap'>
                    {row.lastVisitedAt ? (
                      <>
                        <div>Last visited</div>
                        <div>{formatDate(row.lastVisitedAt)}</div>
                      </>
                    ) : (
                      <div>No visit yet</div>
                    )}
                  </div>
                </div>
                {row.appUsage.length > 0 ? (
                  <div className='mt-2 flex flex-wrap gap-1.5'>
                    {row.appUsage.map(({ app, isActive }) => (
                      <Badge
                        key={app.id}
                        variant={isActive ? 'secondary' : 'muted'}
                        outline={!isActive}
                        size='sm'
                      >
                        {app.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const { allApps, updateAppMetadata } = useAppCatalog();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('worth-the-wait');
  const [dirtyAppIds, setDirtyAppIds] = useState<string[]>([]);
  const [view, setView] = useState<AdminView>('apps');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const allUsers = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Partial<UserProfile>;
        return {
          uid: docSnap.id,
          ...data,
          photoURL: data.customPhotoURL || data.photoURL,
        };
      }) as UserProfile[];
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

        <PillGroup<AdminView>
          label='Dashboard view'
          value={view}
          onChange={setView}
          options={[
            { value: 'apps', label: 'Apps' },
            { value: 'users', label: `Everyone · ${users.length}` },
          ]}
        />

        {view === 'users' ? (
          <AllUsersView apps={allApps} users={users} />
        ) : (
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
              <div className='min-w-0 space-y-6'>
                <AppUsageSection key={`usage-${selectedApp.id}`} app={selectedApp} users={users} />
                <AppConfigEditor
                  key={selectedApp.id}
                  app={selectedApp}
                  users={users}
                  onDirtyChange={handleDirtyChange}
                  onSave={updateAppMetadata}
                />
              </div>
            ) : (
              <p className='text-muted-foreground text-sm'>No app selected.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
