import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, Mail } from 'lucide-react';

import SectionHeader from '@/components/SectionHeader';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import UserAvatar from '@/ui/UserAvatar';
import AddCoSellerSheet from '@apps/going-once/components/people/AddCoSellerSheet';
import PersonSheet, {
  type PersonSheetAction,
} from '@apps/going-once/components/people/PersonSheet';
import { setLeavingSaleId } from '@apps/going-once/store';
import {
  cancelInvite,
  removeMember,
  restoreInvite,
} from '@apps/going-once/store/actions/memberActions';
import {
  selectItems,
  selectSaleInvites,
} from '@apps/going-once/store/selectors';
import type { Sale, SaleEmailInvite } from '@apps/going-once/types';
import { toFirstName } from '@apps/going-once/utils/personName';
import { isSaleSeller } from '@apps/going-once/utils/roles';

const ROW_CLASS =
  'min-h-14 w-full items-center gap-3 rounded-2xl border border-border px-3 py-2 text-left';

type OpenPerson =
  { kind: 'member'; uid: string } | { kind: 'invite'; email: string };

interface PeopleSectionProps {
  sale: Sale;
  uid: string;
  myEmail: string | null;
  /** The person left the sale: go back to Your sales. */
  onLeft: () => void;
}

const formatAdded = (at: number | undefined) =>
  at === undefined ? null : `Added ${formatDateShort(at)}`;

/** The Sale tab's People: the seller, each co-seller and each email waiting to sign in; a row opens the person's sheet. */
function PeopleSection({ sale, uid, myEmail, onLeft }: PeopleSectionProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { pending, showUndo, undo } = useUndoRemoval();
  const invites = useAppSelector((state) => selectSaleInvites(state, sale.id));
  const items = useAppSelector((state) => selectItems(state, sale.id));
  const people = useUserInfo(sale.members);
  const [isAdding, setIsAdding] = useState(false);
  const [open, setOpen] = useState<OpenPerson | null>(null);
  const isSeller = isSaleSeller(sale, uid);

  const nameOf = (memberUid: string) =>
    toFirstName(people?.map[memberUid]?.displayName);
  const coSellerIds = sale.members
    .filter((id) => id !== sale.ownerUid)
    .sort(
      (first, second) =>
        (sale.memberJoinedAt[first] ?? 0) - (sale.memberJoinedAt[second] ?? 0),
    );
  const openInvite =
    open?.kind === 'invite'
      ? (invites.find((invite) => invite.email === open.email) ?? null)
      : null;
  const openMemberId =
    open?.kind === 'member' && sale.members.includes(open.uid)
      ? open.uid
      : null;

  const removeCoSeller = async (memberUid: string) => {
    const name = nameOf(memberUid);
    const holds = items.filter(
      (item) =>
        item.status === 'PENDING' && item.pending?.markedBy === memberUid,
    ).length;
    const isConfirmed = await confirm({
      title: `Remove ${name} from ${sale.name}?`,
      message: `They lose access at once. What they marked keeps their name.${
        holds > 0
          ? ` ${holds === 1 ? '1 pickup they set up is' : `${holds} pickups they set up are`} still Pending.`
          : ''
      }`,
      confirmText: 'Remove from this sale',
      destructive: true,
    });
    if (!isConfirmed) return;
    setOpen(null);
    removeMember(sale.id, memberUid).catch(() =>
      addToast({
        title: `${name} wasn't removed`,
        description: 'Check your connection and try again.',
        type: 'error',
      }),
    );
  };

  const leave = async () => {
    const isConfirmed = await confirm({
      title: `Leave ${sale.name}?`,
      message: `You lose access at once. What you marked keeps your name. ${nameOf(sale.ownerUid)} can add you again.`,
      confirmText: 'Leave this sale',
      destructive: true,
    });
    if (!isConfirmed) return;
    setOpen(null);
    dispatch(setLeavingSaleId(sale.id));
    onLeft();
    removeMember(sale.id, uid).catch(() => {
      dispatch(setLeavingSaleId(null));
      addToast({
        title: `You're still on ${sale.name}`,
        description:
          "Leaving didn't save. Check your connection and try again.",
        type: 'error',
      });
    });
  };

  const removeWaiting = (invite: SaleEmailInvite) => {
    setOpen(null);
    cancelInvite(invite).then(
      () =>
        showUndo(`Removed ${invite.email}`, () => {
          restoreInvite(invite).catch(() =>
            addToast({
              title: `${invite.email} wasn't put back`,
              description: 'Add them again.',
              type: 'error',
            }),
          );
        }),
      () =>
        addToast({
          title: `${invite.email} wasn't removed`,
          description: 'Check your connection and try again.',
          type: 'error',
        }),
    );
  };

  const memberAction = (memberUid: string): PersonSheetAction | null => {
    if (memberUid === uid && !isSeller)
      return {
        label: 'Leave this sale',
        isDestructive: true,
        onClick: () => void leave(),
      };
    if (isSeller && memberUid !== sale.ownerUid)
      return {
        label: 'Remove from this sale',
        isDestructive: true,
        onClick: () => void removeCoSeller(memberUid),
      };
    return null;
  };

  const roleOf = (memberUid: string) =>
    memberUid === sale.ownerUid ? 'Seller' : 'Co-seller';

  const rows = [
    ...[sale.ownerUid, ...coSellerIds].map((memberUid) => ({
      key: memberUid,
      name: `${nameOf(memberUid)} · ${roleOf(memberUid)}`,
      detail: null,
      avatar: (
        <UserAvatar
          user={{
            uid: memberUid,
            displayName: people?.map[memberUid]?.displayName,
            photoURL: people?.map[memberUid]?.photoURL,
          }}
        />
      ),
      isInert: isSeller ? memberUid === uid : memberUid !== uid,
      onOpen: () => setOpen({ kind: 'member', uid: memberUid }),
    })),
    ...invites.map((invite) => ({
      key: invite.email,
      name: invite.email,
      detail: 'Waiting for them to sign in',
      avatar: (
        <span className='bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-full'>
          <Mail className='size-4' aria-hidden='true' />
        </span>
      ),
      isInert: !isSeller,
      onOpen: () => setOpen({ kind: 'invite', email: invite.email }),
    })),
  ];

  return (
    <div className='space-y-2'>
      <SectionHeader
        title='People'
        action={
          isSeller && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setIsAdding(true)}
            >
              Add co-seller
            </Button>
          )
        }
      />
      <ul className='space-y-2'>
        {rows.map((row) => (
          <li key={row.key}>
            {row.isInert ? (
              <div className={join(ROW_CLASS, 'flex')}>
                {row.avatar}
                <span className='min-w-0 flex-1'>
                  <span className='block truncate'>{row.name}</span>
                  {row.detail && (
                    <span className='text-muted-foreground block text-sm'>
                      {row.detail}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <Button
                type='button'
                variant='tertiary'
                onClick={row.onOpen}
                className={join(
                  ROW_CLASS,
                  'hover:bg-muted text-foreground! h-auto justify-start font-normal',
                )}
              >
                {row.avatar}
                <span className='min-w-0 flex-1'>
                  <span className='block truncate'>{row.name}</span>
                  {row.detail && (
                    <span className='text-muted-foreground block text-sm'>
                      {row.detail}
                    </span>
                  )}
                </span>
                <ChevronRight
                  className='text-muted-foreground size-5 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {openMemberId !== null && (
        <PersonSheet
          name={nameOf(openMemberId)}
          role={roleOf(openMemberId)}
          addedLabel={formatAdded(sale.memberJoinedAt[openMemberId])}
          action={memberAction(openMemberId)}
          onClose={() => setOpen(null)}
        />
      )}
      {openInvite !== null && (
        <PersonSheet
          name={openInvite.email}
          role='Waiting for them to sign in'
          addedLabel={formatAdded(openInvite.createdAt)}
          copyMessage={`I added you to ${sale.name} on Going Once. Open ${window.location.origin}/going-once signed in with ${openInvite.email}.`}
          action={
            isSeller
              ? {
                  label: 'Remove',
                  isDestructive: false,
                  onClick: () => removeWaiting(openInvite),
                }
              : null
          }
          onClose={() => setOpen(null)}
        />
      )}
      {isAdding && (
        <AddCoSellerSheet
          sale={sale}
          uid={uid}
          myEmail={myEmail}
          memberEmails={(people?.users ?? []).flatMap((person) =>
            person.email ? [person.email] : [],
          )}
          invites={invites}
          onClose={() => setIsAdding(false)}
        />
      )}
      <UndoSnackbar pending={pending} onUndo={undo} />
    </div>
  );
}

export default PeopleSection;
