import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { X } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { toComparable } from '@/utils/optionMatchUtils';
import { HELM_COPY, MAX_ALIASES } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  setWhoAliases,
  type AliasChange,
} from '@apps/helm/store/actions/whoActions';
import type { OpenWho } from '@apps/helm/types';

interface WhoNamesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  who: OpenWho;
}

/** The nicknames a person goes by: added and removed at once, each removal with its Undo. Search, @ and the assistant read them as names. */
function WhoNamesSheet({ isOpen, onClose, who }: WhoNamesSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const people = useAppSelector((state) => state.helm.who.items);
  const selfWhoId = useAppSelector((state) => state.helm.profile?.selfWhoId);
  const others = people.filter(
    (entry) => entry.id !== who.id && !entry.isUnreadable,
  );

  const save = async (change: AliasChange) => {
    if (!user) return false;
    setIsWriting(true);
    try {
      const result = await setWhoAliases(
        user.uid,
        await getHelmEncryption(user.uid),
        who.id,
        change,
      );
      if (result === 'saved') return true;
      setNote(
        result === 'offline'
          ? HELM_COPY.editNeedsConnection
          : result === 'missing'
            ? HELM_COPY.editGone
            : result === 'full'
              ? HELM_COPY.aliasFull(MAX_ALIASES)
              : result === 'duplicate'
                ? HELM_COPY.aliasDuplicate
                : HELM_COPY.editUnreadable,
      );
    } catch (error) {
      console.error('Helm nicknames were not saved', error);
      setNote(HELM_COPY.editFailed);
    } finally {
      setIsWriting(false);
    }
    return false;
  };

  const selfWho = people.find((entry) => entry.id === selfWhoId);
  const selfWord = selfWho
    ? [...selfWho.name.split(/\s+/), ...selfWho.aliases].find(
        (word) => toComparable(word) === toComparable(text),
      )
    : undefined;

  const takenBy = (alias: string) =>
    others.find((other) =>
      [other.name, ...other.aliases].some(
        (word) => toComparable(word) === toComparable(alias),
      ),
    ) ?? null;

  const add = async () => {
    const alias = text.trim().replace(/\s+/g, ' ');
    if (alias === '' || isWriting) return;
    setNote(null);
    const known = [who.name, ...who.aliases].map((entry) =>
      toComparable(entry),
    );
    if (known.includes(toComparable(alias))) {
      setNote(HELM_COPY.aliasDuplicate);
      return;
    }
    if (who.aliases.length >= MAX_ALIASES) {
      setNote(HELM_COPY.aliasFull(MAX_ALIASES));
      return;
    }
    if (selfWord && who.id !== selfWhoId) {
      setNote(HELM_COPY.aliasIsYou(alias));
      return;
    }
    const other = takenBy(alias);
    if (other) {
      setNote(
        toComparable(other.name) === toComparable(alias)
          ? HELM_COPY.aliasIsNameOf(alias)
          : HELM_COPY.aliasIsAliasOf(alias, other.name),
      );
      return;
    }
    if (await save({ add: alias })) setText('');
  };

  const remove = async (alias: string) => {
    if (isWriting) return;
    setNote(null);
    if (!(await save({ remove: alias }))) return;
    addToast({
      title: HELM_COPY.aliasRemovedToast(alias),
      type: 'info',
      action: {
        label: HELM_COPY.undo,
        onClick: () => void save({ add: alias }),
      },
    });
  };

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.aliasesTitle(who.name)}
    >
      <div className='space-y-4'>
        <div className='space-y-2'>
          <span className='block text-sm font-medium'>
            {HELM_COPY.whoNamesAlsoCalled}
          </span>
          {who.aliases.length === 0 ? (
            <p className='text-muted-foreground text-[15px]'>
              {HELM_COPY.aliasNone}
            </p>
          ) : (
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {who.aliases.map((alias) => (
                <li
                  key={alias}
                  className='flex min-h-12 items-center justify-between gap-2 py-1 pr-1 pl-4'
                >
                  <span className='min-w-0 text-[15px] break-words'>
                    {alias}
                  </span>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='sm'
                    aria-label={HELM_COPY.aliasRemove(alias)}
                    className="relative size-8 shrink-0 p-0 after:absolute after:-inset-1 after:content-['']"
                    onClick={() => void remove(alias)}
                  >
                    <X className='size-4' aria-hidden='true' />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          className='space-y-1.5'
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <label
            htmlFor={`names-${who.id}`}
            className='block text-sm font-medium'
          >
            {HELM_COPY.aliasAddField}
          </label>
          <div className='flex items-center gap-2'>
            <Input
              id={`names-${who.id}`}
              value={text}
              placeholder={HELM_COPY.aliasAddPlaceholder}
              onChange={(event) => setText(event.target.value)}
            />
            <Button
              type='submit'
              variant='secondary'
              size='sm'
              className="relative after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']"
              loading={isWriting}
              disabled={text.trim() === ''}
            >
              {HELM_COPY.aliasAdd}
            </Button>
          </div>
          {(note ??
            (who.aliases.length === 0 ? HELM_COPY.aliasHelp : null)) && (
            <p className='text-muted-foreground text-[13px] text-pretty'>
              {note ?? HELM_COPY.aliasHelp}
            </p>
          )}
        </form>
      </div>
    </FormSheet>
  );
}

export default WhoNamesSheet;
