import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import DeleteIconButton from '@/components/DeleteIconButton';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionHeader from '@/components/SectionHeader';
import { useAuth } from '@hooks/useAuth';
import { ADMIN_QUERY_KEY } from '@lib/admin/adminQueries';
import { debugProfilesQueryOptions } from '@lib/debugProfiles/debugProfileQueries';
import {
  addDebugProfile,
  removeDebugProfile,
  toDebugProfileId,
} from '@lib/debugProfiles/debugProfiles';

import { CARD_CLASS, LIST_CARD_CLASS } from './constants';

const EMAIL_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/** The emails that see what went wrong on error screens; each row opens a sheet holding Remove. */
function DebugDetailsSection() {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const queryClient = useQueryClient();
  const query = useQuery(debugProfilesQueryOptions());
  const profiles = query.data ?? [];
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [...ADMIN_QUERY_KEY, 'debugProfiles'],
    });
  const closeAdd = () => {
    setIsAdding(false);
    setValue('');
    setError(null);
  };

  const getEmailError = (email: string) => {
    if (!email) return 'Enter an email address to add.';
    if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
    return profiles.some((profile) => profile.email === email)
      ? 'That email is already on the list.'
      : null;
  };

  const handleAdd = async () => {
    const email = toDebugProfileId(value);
    const problem = getEmailError(email);
    if (problem || !user) {
      setError(problem);
      return;
    }
    setIsSaving(true);
    try {
      await addDebugProfile(email, user.uid);
      await refresh();
      closeAdd();
    } catch {
      setError("Couldn't add that email just now. Try again in a moment.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (email: string) => {
    const isConfirmed = await confirm({
      title: 'Remove this email?',
      message: `${email} will no longer see what went wrong on error screens.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await removeDebugProfile(email);
      await refresh();
      setOpenEmail(null);
    } catch {
      setRemoveError(
        "Couldn't remove that email just now. Try again in a moment.",
      );
    } finally {
      setIsRemoving(false);
    }
  };

  const getEmptyText = () => {
    if (query.isPending) return 'Loading the list…';
    return query.isError
      ? "We couldn't load this list just now."
      : 'No one yet. Add an email to let them see error details.';
  };

  return (
    <section className='space-y-3'>
      <SectionHeader
        title='Debug details'
        subtitle='These people see what went wrong on error screens, to help track down a problem.'
        action={
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => setIsAdding(true)}
          >
            Add email
          </Button>
        }
      />

      {profiles.length === 0 ? (
        <p className={join(CARD_CLASS, 'text-muted-foreground text-sm')}>
          {getEmptyText()}
        </p>
      ) : (
        <ul className={LIST_CARD_CLASS}>
          {profiles.map((profile) => (
            <li key={profile.email}>
              <Button
                type='button'
                variant='tertiary'
                className='h-auto min-h-14 w-full justify-start gap-3 rounded-none px-4! py-3 text-left font-normal'
                onClick={() => {
                  setRemoveError(null);
                  setOpenEmail(profile.email);
                }}
              >
                <span className='text-foreground min-w-0 flex-1 truncate text-sm font-medium'>
                  {profile.email}
                </span>
                <ChevronRight
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <FormSheet
        isOpen={isAdding}
        isDrawerWhenShort
        onClose={closeAdd}
        title='Add email'
      >
        <div className='space-y-2 pb-2'>
          <Input
            type='email'
            aria-label='Email'
            placeholder='name@example.com'
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
          {error ? (
            <p role='alert' className='text-destructive text-xs'>
              {error}
            </p>
          ) : null}
          <p className='text-muted-foreground text-xs'>
            When they sign in with this email, error screens show them what
            failed.
          </p>
        </div>
        <ModalFooterActions
          cancelAction={
            <Button type='button' variant='tertiary' onClick={closeAdd}>
              Cancel
            </Button>
          }
          rightActions={
            <Button
              type='button'
              variant='primary'
              disabled={isSaving}
              onClick={() => void handleAdd()}
            >
              Add email
            </Button>
          }
        />
      </FormSheet>

      <FormSheet
        isOpen={openEmail !== null}
        isDrawerWhenShort
        onClose={() => setOpenEmail(null)}
        title={openEmail ?? 'Debug details'}
      >
        <p className='text-muted-foreground pb-2 text-sm'>
          They see what went wrong on error screens while signed in with this
          email.
        </p>
        {removeError ? (
          <p role='alert' className='text-destructive pb-2 text-sm'>
            {removeError}
          </p>
        ) : null}
        <ModalFooterActions
          leftActions={
            <DeleteIconButton
              label='Remove email'
              disabled={isRemoving}
              onClick={() => openEmail && void handleRemove(openEmail)}
            />
          }
          rightActions={
            <Button
              type='button'
              variant='primary'
              onClick={() => setOpenEmail(null)}
            >
              Done
            </Button>
          }
        />
      </FormSheet>
    </section>
  );
}

export default DebugDetailsSection;
