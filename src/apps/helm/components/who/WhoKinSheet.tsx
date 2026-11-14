import { useState } from 'react';

import { Button, Select } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { canKinOrder } from '@apps/helm/engine/kin';
import { HELM_COPY, KIN_KINDS } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { setWhoKin } from '@apps/helm/store/actions/whoActions';
import type { KinKind, KinOrder, OpenWho } from '@apps/helm/types';
import { KIN_ORDER_LABELS } from '@apps/helm/utils/kinText';

interface WhoKinSheetProps {
  isOpen: boolean;
  onClose: () => void;
  who: OpenWho;
}

const NOT_SET = 'none';
const NOT_SAID = 'none';

const KIND_OPTIONS = [
  { value: NOT_SET, text: HELM_COPY.kinNotSet },
  ...KIN_KINDS.map((entry) => ({
    value: entry.kind,
    text: entry.written.charAt(0).toUpperCase() + entry.written.slice(1),
  })),
];

const ORDER_OPTIONS = [
  { value: NOT_SAID, label: HELM_COPY.kinOrderNotSaid },
  ...(Object.keys(KIN_ORDER_LABELS) as KinOrder[]).map((order) => ({
    value: order,
    label: KIN_ORDER_LABELS[order],
  })),
];

interface FormProps extends WhoKinSheetProps {
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

function WhoKinForm({ who, onClose, requestClose, onDirtyChange }: FormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [kind, setKind] = useState<string>(who.kin?.kind ?? NOT_SET);
  const [order, setOrder] = useState<string>(who.kin?.order ?? NOT_SAID);
  const [isSaving, setIsSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canOrder = kind !== NOT_SET && canKinOrder(kind as KinKind);

  const save = async () => {
    if (!user || isSaving) return;
    setIsSaving(true);
    setNote(null);
    const kin =
      kind === NOT_SET
        ? null
        : {
            kind: kind as KinKind,
            order: canOrder && order !== NOT_SAID ? (order as KinOrder) : null,
          };
    try {
      const result = await setWhoKin(
        user.uid,
        await getHelmEncryption(user.uid),
        who.id,
        kin,
      );
      if (result === 'saved') {
        addToast({
          title: kin
            ? HELM_COPY.kinSavedToast(who.name)
            : HELM_COPY.kinClearedToast(who.name),
          type: 'success',
        });
        onClose();
        return;
      }
      setNote(
        result === 'offline'
          ? HELM_COPY.editNeedsConnection
          : result === 'missing'
            ? HELM_COPY.editGone
            : HELM_COPY.editUnreadable,
      );
    } catch (error) {
      console.error('Helm family word was not saved', error);
      setNote(HELM_COPY.editFailed);
    }
    setIsSaving(false);
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <span className='block text-sm font-medium'>
          {HELM_COPY.kinKindField}
        </span>
        <Select
          options={KIND_OPTIONS}
          value={kind}
          onChange={(value) => {
            setKind(value);
            onDirtyChange(true);
          }}
        />
      </div>
      {canOrder && (
        <div className='space-y-1.5'>
          <span className='block text-sm font-medium'>
            {HELM_COPY.kinOrderField}
          </span>
          <PillGroup
            label={HELM_COPY.kinOrderField}
            options={ORDER_OPTIONS}
            value={order}
            onChange={(value) => {
              setOrder(value);
              onDirtyChange(true);
            }}
          />
        </div>
      )}
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.kinHelp}
      </p>
      <ModalFooterActions
        note={note}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isSaving} onClick={() => void save()}>
            {HELM_COPY.editSave}
          </Button>
        }
      />
    </div>
  );
}

/** How someone is related to you, from the fixed family list, with older or younger where that means something. Clearing it is "Not set". */
function WhoKinSheet({ isOpen, onClose, who }: WhoKinSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const requestClose = useDiscardGuard({
    isDirty,
    onClose: () => {
      setIsDirty(false);
      onClose();
    },
  });

  return (
    <FormSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={HELM_COPY.kinTitle(who.name)}
    >
      {isOpen && (
        <WhoKinForm
          who={who}
          isOpen={isOpen}
          onClose={() => {
            setIsDirty(false);
            onClose();
          }}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
        />
      )}
    </FormSheet>
  );
}

export default WhoKinSheet;
