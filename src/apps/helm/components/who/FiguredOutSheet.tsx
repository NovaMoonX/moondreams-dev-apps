import { useState } from 'react';

import { Button, Select } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Check, X } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import {
  toConnectionId,
  type ConnectionGenders,
  type InferredLink,
} from '@apps/helm/engine/connections';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  settleFamilyLink,
  undoSettledFamilyLink,
  type ConnectionResult,
} from '@apps/helm/store/actions/connectionActions';
import { selectFiguredOutByWho } from '@apps/helm/store/selectors/connectionSelectors';
import type { KinKind, OpenWho } from '@apps/helm/types';
import {
  FAMILY_OPTIONS,
  NOT_SURE,
  toBecauseLine,
  toConnectionSentence,
  toFiguredSide,
  toSideLine,
} from '@apps/helm/utils/connectionText';

const NOT_RELATED = 'notRelated';

const WRONG_OPTIONS = [
  { value: NOT_RELATED, text: HELM_COPY.figuredNotRelated },
  ...FAMILY_OPTIONS,
];

interface FiguredOutSheetProps {
  isOpen: boolean;
  onClose: () => void;
  who: OpenWho;
  /** The other person of the figured-out link being looked at. */
  otherId: string | null;
}

interface BodyProps {
  who: OpenWho;
  otherId: string;
  onClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

const toGenders = (link: InferredLink): ConnectionGenders => ({
  [link.firstId]: link.genders.first,
  [link.secondId]: link.genders.second,
});

const toNote = (result: Exclude<ConnectionResult, 'saved' | 'unreadable'>) =>
  result === 'offline'
    ? HELM_COPY.editNeedsConnection
    : result === 'missing'
      ? HELM_COPY.connectionLinkGone
      : HELM_COPY.figuredDuplicate;

function Body({ who, otherId, onClose, onDirtyChange }: BodyProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const people = useAppSelector((state) => state.helm.who.items);
  const selfId = useAppSelector((state) => state.helm.profile?.selfWhoId);
  const figuredOut = useAppSelector(selectFiguredOutByWho);
  const [isFixing, setIsFixing] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const backToFirstView = () => {
    setIsFixing(false);
    setChoice(null);
    setNote(null);
    onDirtyChange(false);
  };
  const other = people.find((entry) => entry.id === otherId) ?? null;
  const link = figuredOut
    .get(who.id)
    ?.find((entry) => [entry.firstId, entry.secondId].includes(otherId));

  if (!link || !other)
    return (
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {HELM_COPY.figuredGone}
      </p>
    );

  const ownName = who.isSelf ? null : who.name;
  const side = toFiguredSide(link, who.id);
  const nameOf = (id: string) =>
    people.find((entry) => entry.id === id)?.name ?? '';

  const answer = async (
    source: 'confirmed' | 'refused',
    next: InferredLink,
    toast: string,
  ) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setNote(null);
    try {
      const encryption = await getHelmEncryption(user.uid);
      const { result, createdAt } = await settleFamilyLink(
        user.uid,
        encryption,
        {
          firstId: next.firstId,
          secondId: next.secondId,
          relationOfFirstToSecond: next.relationOfFirstToSecond,
          genders: toGenders(link),
          source,
        },
      );
      if (result === 'saved') {
        onDirtyChange(false);
        onClose();
        addToast({
          title: toast,
          type: 'info',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void undoSettledFamilyLink(
                user.uid,
                toConnectionId(next.firstId, next.secondId, 'family'),
                createdAt,
              ).then(
                (undone) =>
                  addToast({
                    title:
                      undone === 'undone'
                        ? HELM_COPY.figuredUndone
                        : HELM_COPY.figuredUndoChanged,
                    type: 'info',
                  }),
                (error: unknown) => {
                  console.error('Figured-out answer was not undone', error);
                  addToast({ title: HELM_COPY.editFailed, type: 'error' });
                },
              ),
          },
        });
        return;
      }
      setNote(toNote(result));
    } catch (error) {
      console.error('Figured-out answer was not saved', error);
      setNote(HELM_COPY.editFailed);
    }
    setIsBusy(false);
  };

  const confirm = () =>
    answer(
      'confirmed',
      link,
      HELM_COPY.figuredLinkedToast(
        toConnectionSentence('family', side, other.name, ownName),
      ),
    );

  const saveFix = () => {
    if (choice === null) return Promise.resolve();
    if (choice === NOT_RELATED)
      return answer(
        'refused',
        link,
        HELM_COPY.figuredRefusedToast(other.name, ownName),
      );
    const word = choice === NOT_SURE ? null : (choice as KinKind);
    return answer(
      'confirmed',
      {
        ...link,
        firstId: other.id,
        secondId: who.id,
        relationOfFirstToSecond: word,
      },
      HELM_COPY.figuredLinkedToast(
        toConnectionSentence(
          'family',
          { ...side, relation: word },
          other.name,
          ownName,
        ),
      ),
    );
  };

  if (isFixing)
    return (
      <div className='space-y-4'>
        <div className='space-y-1.5 max-sm:min-h-80'>
          <span className='block text-sm font-medium break-words'>
            {HELM_COPY.connectionFamilyField(other.name, ownName)}
          </span>
          <Select
            options={WRONG_OPTIONS}
            value={choice ?? ''}
            placeholder={HELM_COPY.figuredFixLead}
            onChange={(value) => {
              setChoice(value);
              onDirtyChange(true);
            }}
          />
        </div>
        <ModalFooterActions
          note={note ?? (choice === null ? HELM_COPY.figuredFixPick : null)}
          cancelAction={
            <Button
              type='button'
              variant='tertiary'
              disabled={isBusy}
              onClick={backToFirstView}
            >
              {HELM_COPY.editCancel}
            </Button>
          }
          rightActions={
            <Button
              type='button'
              loading={isBusy}
              disabled={choice === null}
              onClick={() => void saveFix()}
            >
              {HELM_COPY.figuredFixSave}
            </Button>
          }
        />
      </div>
    );

  return (
    <div className='space-y-6'>
      <div className='-mt-1 space-y-1'>
        <p className='text-muted-foreground text-[15px] text-pretty break-words'>
          {toSideLine('family', side, ownName)}{' '}
          <span className='whitespace-nowrap'>{HELM_COPY.figuredSuffix}</span>
        </p>
        <p className='text-muted-foreground text-[13px] text-pretty break-words'>
          {toBecauseLine(link, selfId ?? null, nameOf)}
        </p>
      </div>
      {note && <p className='text-destructive text-sm'>{note}</p>}
      <ActionGroup>
        <ActionRow
          isGrouped
          icon={<Check />}
          label={HELM_COPY.figuredConfirm}
          subtitle={HELM_COPY.figuredConfirmSubtitle}
          isDisabled={isBusy}
          onClick={() => void confirm()}
        />
      </ActionGroup>
      <ActionGroup>
        <ActionRow
          isGrouped
          icon={<X />}
          label={HELM_COPY.figuredWrong}
          subtitle={HELM_COPY.figuredWrongSubtitle}
          hasChevron
          isDisabled={isBusy}
          onClick={() => setIsFixing(true)}
        />
      </ActionGroup>
    </div>
  );
}

/** A worked-out family link: why it was worked out, That's right (links it) and Not right (the right word, or that they aren't related), each with Undo. */
function FiguredOutSheet({
  isOpen,
  onClose,
  who,
  otherId,
}: FiguredOutSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const people = useAppSelector((state) => state.helm.who.items);
  const title =
    people.find((entry) => entry.id === otherId)?.name ??
    HELM_COPY.connectionTitle;
  const close = () => {
    setIsDirty(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

  return (
    <FormSheet isOpen={isOpen} onClose={requestClose} title={title}>
      {isOpen && otherId && (
        <Body
          who={who}
          otherId={otherId}
          onClose={close}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default FiguredOutSheet;
